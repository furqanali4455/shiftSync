import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import SwapRequest from "@/models/SwapRequest";
import Shift from "@/models/Shift";
import { loadActor, actorCanAccessLocation } from "@/lib/actor";
import { getAssigneeIdsFromShiftDoc } from "@/lib/shiftPayload";
import { notifyMany } from "@/lib/notify";
import { sseBroadcast } from "@/lib/sseHub";

const PENDING_STATUSES = ["pending_target", "open_pickup", "pending_manager"];

async function expireStale() {
  const now = new Date();
  await SwapRequest.updateMany(
    {
      kind: "drop",
      status: "open_pickup",
      expiresAt: { $lt: now },
    },
    { $set: { status: "expired" } },
  );
}

export async function GET(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    await expireStale();

    let q;
    if (actor.role === "Staff") {
      q = {
        $or: [
          { requester: actor._id },
          { targetUser: actor._id },
          { claimedBy: actor._id },
        ],
      };
    } else if (actor.role === "Manager" || actor.role === "Admin") {
      q = { status: "pending_manager" };
    } else {
      q = { _id: { $exists: false } };
    }

    const list = await SwapRequest.find(q)
      .sort({ updatedAt: -1 })
      .populate({ path: "shift", populate: { path: "location", select: "name" } })
      .populate("requester", "name email")
      .populate("targetUser", "name email")
      .populate("claimedBy", "name email")
      .limit(100)
      .lean();

    if (actor.role === "Manager") {
      const filtered = [];
      for (const row of list) {
        const loc = row.shift?.location;
        if (loc && (await actorCanAccessLocation(actor, loc))) filtered.push(row);
      }
      return NextResponse.json(filtered);
    }

    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.role !== "Staff") {
      return NextResponse.json({ error: "Only staff can open swap/drop requests." }, { status: 403 });
    }

    const body = await request.json();
    const { kind, shiftId, targetUserId } = body || {};
    if (!kind || !shiftId || !["swap", "drop"].includes(kind)) {
      return NextResponse.json({ error: "kind and shiftId required." }, { status: 400 });
    }
    if (kind === "swap" && !targetUserId) {
      return NextResponse.json({ error: "targetUserId required for swap." }, { status: 400 });
    }

    await connectDB();
    await expireStale();

    const pending = await SwapRequest.countDocuments({
      requester: actor._id,
      status: { $in: PENDING_STATUSES },
    });
    if (pending >= 3) {
      return NextResponse.json(
        { error: "You already have 3 pending swap or coverage requests." },
        { status: 400 },
      );
    }

    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    const assignees = getAssigneeIdsFromShiftDoc(shift.toObject());
    if (!assignees.includes(actor._id.toString())) {
      return NextResponse.json({ error: "You are not assigned to this shift." }, { status: 403 });
    }

    const dup = await SwapRequest.findOne({
      shift: shiftId,
      requester: actor._id,
      status: { $in: PENDING_STATUSES },
    });
    if (dup) {
      return NextResponse.json({ error: "You already have a pending request for this shift." }, { status: 400 });
    }

    if (kind === "swap") {
      const doc = await SwapRequest.create({
        kind: "swap",
        shift: shiftId,
        requester: actor._id,
        targetUser: targetUserId,
        status: "pending_target",
      });
      await notifyMany([targetUserId], {
        type: "swap_incoming",
        title: "Swap request",
        body: `${actor.name} asked to swap a shift with you.`,
        meta: { swapId: doc._id.toString(), shiftId },
      });
      sseBroadcast({ type: "swap_updated" });
      return NextResponse.json(doc, { status: 201 });
    }

    const expiresAt = new Date(new Date(shift.startTime).getTime() - 24 * 3600000);
    const doc = await SwapRequest.create({
      kind: "drop",
      shift: shiftId,
      requester: actor._id,
      status: "open_pickup",
      expiresAt,
    });
    sseBroadcast({ type: "swap_updated" });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
