import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import SwapRequest from "@/models/SwapRequest";
import Shift from "@/models/Shift";
import User from "@/models/User";
import { loadActor, actorCanAccessLocation } from "@/lib/actor";
import { getAssigneeIdsFromShiftDoc } from "@/lib/shiftPayload";
import { checkConflicts } from "@/lib/conflicts";
import { notifyMany } from "@/lib/notify";
import { sseBroadcast } from "@/lib/sseHub";
import { writeAudit } from "@/lib/audit";

async function notifyManagersForShift(shiftLocationId, payload) {
  const users = await User.find({
    $or: [
      { role: "Admin" },
      { role: "Manager", locations: shiftLocationId },
    ],
  })
    .select("_id")
    .lean();
  await notifyMany(
    users.map((u) => u._id.toString()),
    payload,
  );
}

function replaceAssignee(ids, fromId, toId) {
  return ids.map((id) => (id === fromId ? toId : id));
}

export async function POST(request, { params }) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const action = body?.action;
    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }

    await connectDB();
    const doc = await SwapRequest.findById(id).populate("shift");
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const shift = doc.shift;
    if (!shift) {
      return NextResponse.json({ error: "Shift missing" }, { status: 404 });
    }

    if (action === "accept_swap") {
      if (doc.kind !== "swap" || doc.status !== "pending_target") {
        return NextResponse.json({ error: "Invalid state" }, { status: 400 });
      }
      if (actor._id.toString() !== doc.targetUser.toString()) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      doc.status = "pending_manager";
      await doc.save();
      await notifyManagersForShift(shift.location, {
        type: "swap_pending_manager",
        title: "Swap needs approval",
        body: "A staff swap is waiting for manager approval.",
        meta: { swapId: doc._id.toString(), shiftId: shift._id.toString() },
      });
      sseBroadcast({ type: "swap_updated" });
      return NextResponse.json(doc);
    }

    if (action === "claim_drop") {
      if (doc.kind !== "drop" || doc.status !== "open_pickup") {
        return NextResponse.json({ error: "Invalid state" }, { status: 400 });
      }
      if (actor.role !== "Staff") {
        return NextResponse.json({ error: "Only staff can claim" }, { status: 403 });
      }
      if (new Date(doc.expiresAt).getTime() < Date.now()) {
        doc.status = "expired";
        await doc.save();
        return NextResponse.json({ error: "Drop request expired" }, { status: 400 });
      }
      if (actor._id.toString() === doc.requester.toString()) {
        return NextResponse.json({ error: "You cannot claim your own drop" }, { status: 400 });
      }
      doc.claimedBy = actor._id;
      doc.status = "pending_manager";
      await doc.save();
      await notifyManagersForShift(shift.location, {
        type: "drop_pending_manager",
        title: "Coverage pickup needs approval",
        body: `${actor.name} offered to cover a dropped shift.`,
        meta: { swapId: doc._id.toString(), shiftId: shift._id.toString() },
      });
      sseBroadcast({ type: "swap_updated" });
      return NextResponse.json(doc);
    }

    if (action === "cancel") {
      if (actor._id.toString() !== doc.requester.toString()) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["pending_target", "open_pickup"].includes(doc.status)) {
        return NextResponse.json({ error: "Cannot cancel now" }, { status: 400 });
      }
      doc.status = "cancelled";
      await doc.save();
      sseBroadcast({ type: "swap_updated" });
      return NextResponse.json(doc);
    }

    if (["approve", "reject"].includes(action)) {
      if (actor.role !== "Admin" && actor.role !== "Manager") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!actorCanAccessLocation(actor, shift.location)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (doc.status !== "pending_manager") {
        return NextResponse.json({ error: "Not awaiting manager" }, { status: 400 });
      }

      if (action === "reject") {
        doc.status = "rejected";
        await doc.save();
        await notifyMany(
          [doc.requester.toString(), doc.targetUser, doc.claimedBy].filter(Boolean).map(String),
          {
            type: "swap_rejected",
            title: "Request declined",
            body: "A manager did not approve the swap/coverage change.",
            meta: { swapId: doc._id.toString() },
          },
        );
        sseBroadcast({ type: "swap_updated" });
        return NextResponse.json(doc);
      }

      const fresh = await Shift.findById(shift._id);
      const ids = getAssigneeIdsFromShiftDoc(fresh.toObject());
      const rid = doc.requester.toString();

      if (doc.kind === "swap") {
        const tid = doc.targetUser.toString();
        const next = replaceAssignee(ids, rid, tid);
        for (const uid of next) {
          const c = await checkConflicts(
            uid,
            fresh.startTime,
            fresh.endTime,
            fresh.location,
            fresh.requiredSkill,
            fresh._id,
          );
          if (c.hasConflict) {
            return NextResponse.json({ error: c.message, code: c.code }, { status: 400 });
          }
        }
        fresh.assignedUsers = next.map((x) => new mongoose.Types.ObjectId(x));
        fresh.user = next[0] ? new mongoose.Types.ObjectId(next[0]) : null;
        fresh.schemaVersion = (fresh.schemaVersion || 0) + 1;
        await fresh.save();
      } else {
        const cid = doc.claimedBy.toString();
        const next = ids.filter((x) => x !== rid);
        if (!next.includes(cid)) next.push(cid);
        for (const uid of next) {
          const c = await checkConflicts(
            uid,
            fresh.startTime,
            fresh.endTime,
            fresh.location,
            fresh.requiredSkill,
            fresh._id,
          );
          if (c.hasConflict) {
            return NextResponse.json({ error: c.message, code: c.code }, { status: 400 });
          }
        }
        fresh.assignedUsers = next.map((x) => new mongoose.Types.ObjectId(x));
        fresh.user = next[0] ? new mongoose.Types.ObjectId(next[0]) : null;
        fresh.schemaVersion = (fresh.schemaVersion || 0) + 1;
        await fresh.save();
      }

      doc.status = "approved";
      await doc.save();

      await writeAudit({
        actorId: actor._id,
        action: `swap.${doc.kind}.approve`,
        entityType: "Shift",
        entityId: fresh._id,
        locationId: fresh.location,
        before: { assignedUsers: ids },
        after: { assignedUsers: getAssigneeIdsFromShiftDoc(fresh.toObject()) },
      });

      await notifyMany(
        [doc.requester.toString(), doc.targetUser, doc.claimedBy].filter(Boolean).map(String),
        {
          type: "swap_approved",
          title: "Swap / coverage approved",
          body: "Your schedule change was approved.",
          meta: { shiftId: fresh._id.toString() },
        },
      );

      sseBroadcast({ type: "shifts_updated" });
      sseBroadcast({ type: "swap_updated" });
      return NextResponse.json({ swap: doc, shift: fresh });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
