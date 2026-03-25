import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import { requireRole } from "@/lib/auth";
import { loadActor, actorCanAccessLocation, managerLocationObjectIds } from "@/lib/actor";
import { notifyMany } from "@/lib/notify";
import { sseBroadcast } from "@/lib/sseHub";
import { writeAudit } from "@/lib/audit";
import { getAssigneeIdsFromShiftDoc } from "@/lib/shiftPayload";

export async function POST(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }
    const actor = await loadActor(request);
    const body = await request.json();
    const weekStart = body.weekStart ? new Date(body.weekStart) : new Date();
    if (Number.isNaN(weekStart.getTime())) {
      return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });
    }
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

    await connectDB();

    const locFilter = body.locationId || null;
    if (locFilter && !actorCanAccessLocation(actor, locFilter)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const q = {
      status: "Draft",
      startTime: { $lt: weekEnd },
      endTime: { $gt: weekStart },
    };
    if (locFilter) q.location = locFilter;
    else if (actor.role === "Manager") {
      const lids = managerLocationObjectIds(actor);
      if (!lids?.length) {
        return NextResponse.json({ updated: 0 });
      }
      q.location = { $in: lids };
    }

    const drafts = await Shift.find(q).lean();
    const ids = drafts.map((d) => d._id);
    await Shift.updateMany({ _id: { $in: ids } }, { $set: { status: "Published" } });

    const notifyIds = new Set();
    for (const sh of drafts) {
      getAssigneeIdsFromShiftDoc(sh).forEach((id) => notifyIds.add(id));
    }
    if (notifyIds.size > 0) {
      await notifyMany([...notifyIds], {
        type: "schedule_published",
        title: "Schedule published",
        body: "Your manager published an updated week of shifts.",
        meta: { weekStart: weekStart.toISOString() },
      });
    }

    await writeAudit({
      actorId: actor._id,
      action: "schedule.publish_week",
      entityType: "Schedule",
      entityId: actor._id,
      locationId: locFilter || null,
      before: { count: drafts.length },
      after: { publishedIds: ids.map(String) },
    });

    sseBroadcast({ type: "shifts_updated" });
    return NextResponse.json({ updated: drafts.length, ids: ids.map(String) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
