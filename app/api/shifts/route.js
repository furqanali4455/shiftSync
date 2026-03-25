import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import { checkConflicts } from "@/lib/conflicts";
import { requireRole } from "@/lib/auth";
import {
  evaluateLaborForAssignment,
  laborOverrideValid,
} from "@/lib/laborCompliance";
import { loadActor, actorCanAccessLocation, managerLocationObjectIds } from "@/lib/actor";
import {
  parseShiftWriteBody,
  normalizeShiftAssignees,
} from "@/lib/shiftPayload";
import { findAlternativeAssignees } from "@/lib/alternatives";
import { writeAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";
import { sseBroadcast } from "@/lib/sseHub";

function shiftsListFilter(actor) {
  if (!actor) return { _id: { $exists: false } };
  if (actor.role === "Admin") return {};
  if (actor.role === "Manager") {
    const locs = managerLocationObjectIds(actor);
    if (!locs?.length) return { _id: { $exists: false } };
    return { location: { $in: locs } };
  }
  if (actor.role === "Staff") {
    return {
      $or: [
        { status: "Published" },
        { user: actor._id },
        { assignedUsers: actor._id },
      ],
    };
  }
  return { _id: { $exists: false } };
}

export async function GET(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page"));
    const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 200);
    const baseFilter = shiftsListFilter(actor);

    if (page) {
      const skip = (page - 1) * limit;
      const [shifts, total] = await Promise.all([
        Shift.find(baseFilter)
          .populate("user")
          .populate("assignedUsers")
          .populate("location")
          .sort({ startTime: 1 })
          .skip(skip)
          .limit(limit),
        Shift.countDocuments(baseFilter),
      ]);
      return NextResponse.json({ data: shifts, total, page, limit });
    }

    const shifts = await Shift.find(baseFilter)
      .populate("user")
      .populate("assignedUsers")
      .populate("location")
      .sort({ startTime: 1 })
      .limit(limit);
    return NextResponse.json(shifts);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const raw = await request.json();
    const { rest: rawData, laborOverride } = parseShiftWriteBody(raw || {});

    let data;
    try {
      data = normalizeShiftAssignees(rawData);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    await connectDB();

    if (!actorCanAccessLocation(actor, data.location)) {
      return NextResponse.json(
        { error: "You cannot create shifts for this location." },
        { status: 403 },
      );
    }

    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid start or end time provided." }, { status: 400 });
    }

    if (start >= end) {
      return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
    }

    const assigneeIds = data.assignedUsers.map((x) => String(x));
    let laborWarningsOut = [];
    const laborBlocksAcc = [];

    for (const uid of assigneeIds) {
      const conflictResult = await checkConflicts(
        uid,
        data.startTime,
        data.endTime,
        data.location,
        data.requiredSkill,
      );
      if (conflictResult.hasConflict) {
        const suggestions = await findAlternativeAssignees(
          data.location,
          data.requiredSkill,
          data.startTime,
          data.endTime,
          { excludeUserIds: assigneeIds, shiftId: null, limit: 6 },
        );
        return NextResponse.json(
          {
            error: conflictResult.message,
            code: conflictResult.code,
            suggestions,
          },
          { status: 400 },
        );
      }

      const labor = await evaluateLaborForAssignment(uid, data.startTime, data.endTime, {});
      laborWarningsOut = laborWarningsOut.concat(labor.warnings || []);
      laborBlocksAcc.push(...(labor.blocks || []));
    }

    if (laborBlocksAcc.length > 0) {
      if (!laborOverrideValid(laborOverride)) {
        return NextResponse.json(
          {
            error: "Labor compliance rules blocked this assignment.",
            laborBlocks: laborBlocksAcc,
            laborWarnings: laborWarningsOut,
          },
          { status: 422 },
        );
      }
      data.laborOverrideReason = String(laborOverride.reason).trim();
    } else {
      data.laborOverrideReason = null;
    }

    const shift = new Shift(data);
    await shift.save();
    const out = shift.toObject();

    await writeAudit({
      actorId: actor._id,
      action: "shift.create",
      entityType: "Shift",
      entityId: shift._id,
      locationId: shift.location,
      before: null,
      after: {
        title: shift.title,
        location: shift.location,
        assignedUsers: shift.assignedUsers,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,
      },
    });

    if (assigneeIds.length > 0) {
      await notifyMany(assigneeIds, {
        type: "shift_assigned",
        title: "Shift assignment",
        body: `You were assigned: ${shift.title}`,
        meta: { shiftId: shift._id.toString() },
      });
    }

    sseBroadcast({ type: "shifts_updated", scope: "all" });

    return NextResponse.json(
      { ...out, laborWarnings: laborWarningsOut },
      { status: 201 },
    );
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors)
        .map((e) => e.message)
        .join(", ");
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
