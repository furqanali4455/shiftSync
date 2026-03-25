import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import { checkConflicts } from "@/lib/conflicts";
import { requireRole } from "@/lib/auth";
import {
  evaluateLaborForAssignment,
  laborOverrideValid,
} from "@/lib/laborCompliance";
import { loadActor, actorCanAccessLocation } from "@/lib/actor";
import {
  parseShiftWriteBody,
  normalizeShiftAssignees,
  getAssigneeIdsFromShiftDoc,
} from "@/lib/shiftPayload";
import { findAlternativeAssignees } from "@/lib/alternatives";
import { isShiftLockedByCutoff } from "@/lib/scheduleCutoff";
import { cancelPendingSwapsForShift } from "@/lib/swapCancel";
import { writeAudit } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";
import { sseBroadcast } from "@/lib/sseHub";

export async function DELETE(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { id } = await params;
    await connectDB();
    const existing = await Shift.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }
    if (!actorCanAccessLocation(actor, existing.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await cancelPendingSwapsForShift(id, existing.title);
    await Shift.findByIdAndDelete(id);

    await writeAudit({
      actorId: actor._id,
      action: "shift.delete",
      entityType: "Shift",
      entityId: existing._id,
      locationId: existing.location,
      before: {
        title: existing.title,
        assignedUsers: existing.assignedUsers,
        startTime: existing.startTime,
        endTime: existing.endTime,
      },
      after: null,
    });

    sseBroadcast({ type: "shifts_updated", scope: "all" });
    return NextResponse.json({ message: "Shift deleted" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { id } = await params;
    const raw = await request.json();
    const {
      rest: rawData,
      laborOverride,
      expectedSchemaVersion,
      bypassScheduleCutoff,
    } = parseShiftWriteBody(raw || {});

    let data;
    try {
      data = normalizeShiftAssignees(rawData);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    await connectDB();

    const existing = await Shift.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    if (!actorCanAccessLocation(actor, existing.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!actorCanAccessLocation(actor, data.location)) {
      return NextResponse.json(
        { error: "You cannot move this shift to that location." },
        { status: 403 },
      );
    }

    const lockStart = data.startTime || existing.startTime;
    if (
      isShiftLockedByCutoff(lockStart, {
        role: actor.role,
        bypassScheduleCutoff,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "This shift is within the edit cutoff window (default 48h before start). Admins may resubmit with bypassScheduleCutoff: true.",
        },
        { status: 403 },
      );
    }

    if (
      expectedSchemaVersion !== null &&
      !Number.isNaN(expectedSchemaVersion) &&
      existing.schemaVersion !== expectedSchemaVersion
    ) {
      return NextResponse.json(
        {
          error: "Shift was updated elsewhere. Refresh and try again.",
          code: "CONCURRENT_EDIT",
        },
        { status: 409 },
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
        id,
      );
      if (conflictResult.hasConflict) {
        const suggestions = await findAlternativeAssignees(
          data.location,
          data.requiredSkill,
          data.startTime,
          data.endTime,
          { excludeUserIds: assigneeIds, shiftId: id, limit: 6 },
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

      const labor = await evaluateLaborForAssignment(
        uid,
        data.startTime,
        data.endTime,
        { excludeShiftId: id },
      );
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

    const beforeSnap = {
      title: existing.title,
      location: existing.location,
      assignedUsers: [...(existing.assignedUsers || [])],
      user: existing.user,
      startTime: existing.startTime,
      endTime: existing.endTime,
      status: existing.status,
      requiredHeadcount: existing.requiredHeadcount,
    };

    await cancelPendingSwapsForShift(id, existing.title);

    data.schemaVersion = (existing.schemaVersion || 0) + 1;

    const prevAssignees = new Set(getAssigneeIdsFromShiftDoc(existing.toObject()));
    const shift = await Shift.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    await writeAudit({
      actorId: actor._id,
      action: "shift.update",
      entityType: "Shift",
      entityId: shift._id,
      locationId: shift.location,
      before: beforeSnap,
      after: {
        title: shift.title,
        location: shift.location,
        assignedUsers: shift.assignedUsers,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,
        requiredHeadcount: shift.requiredHeadcount,
      },
    });

    const newAssignees = new Set(getAssigneeIdsFromShiftDoc(shift.toObject()));
    const added = [...newAssignees].filter((x) => !prevAssignees.has(x));
    if (added.length > 0) {
      await notifyMany(added, {
        type: "shift_assigned",
        title: "Shift updated — you are assigned",
        body: shift.title,
        meta: { shiftId: shift._id.toString() },
      });
    }

    sseBroadcast({ type: "shifts_updated", scope: "all" });

    const out = shift.toObject();
    return NextResponse.json({ ...out, laborWarnings: laborWarningsOut });
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
