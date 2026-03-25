import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import User from "@/models/User";
import { requireRole } from "@/lib/auth";
import { loadActor, managerLocationObjectIds } from "@/lib/actor";
import {
  analyzeLaborCompliance,
  endOfIsoWeekUtcExclusive,
  getBaseHourlyRate,
  OT_MULTIPLIER,
  shiftsContributingToOvertime,
  startOfIsoWeekUtc,
} from "@/lib/laborCompliance";
import { getAssigneeIdsFromShiftDoc } from "@/lib/shiftPayload";

function shiftHasAssigneesFilter() {
  return {
    $or: [{ user: { $ne: null } }, { "assignedUsers.0": { $exists: true } }],
  };
}

export async function GET(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { searchParams } = new URL(request.url);
    const weekStartParam = searchParams.get("weekStart");
    const ref = weekStartParam ? new Date(weekStartParam) : new Date();
    if (Number.isNaN(ref.getTime())) {
      return NextResponse.json({ error: "Invalid weekStart date." }, { status: 400 });
    }

    const weekStart = startOfIsoWeekUtc(ref);
    const weekEnd = endOfIsoWeekUtcExclusive(weekStart);

    await connectDB();

    const windowStart = new Date(weekStart.getTime() - 21 * 86400000);
    const windowEnd = new Date(weekEnd.getTime() + 21 * 86400000);

    const locQ = {};
    if (actor.role === "Manager") {
      const lids = managerLocationObjectIds(actor);
      if (!lids?.length) {
        return NextResponse.json({
          weekStart: weekStart.toISOString(),
          weekEndExclusive: weekEnd.toISOString(),
          baseRatePerHour: getBaseHourlyRate(),
          overtimeMultiplier: OT_MULTIPLIER,
          note: "UTC calendar rules; see README.",
          employees: [],
        });
      }
      locQ.location = { $in: lids };
    }

    const shiftsInWeek = await Shift.find({
      ...locQ,
      ...shiftHasAssigneesFilter(),
      startTime: { $lt: weekEnd },
      endTime: { $gt: weekStart },
    })
      .populate("user", "name email role")
      .populate("location", "name timezone")
      .lean();

    const windowShifts = await Shift.find({
      ...locQ,
      ...shiftHasAssigneesFilter(),
      startTime: { $lt: windowEnd },
      endTime: { $gt: windowStart },
    })
      .select("startTime endTime _id user assignedUsers")
      .lean();

    const windowByUser = new Map();
    for (const sh of windowShifts) {
      for (const uid of getAssigneeIdsFromShiftDoc(sh)) {
        if (!windowByUser.has(uid)) windowByUser.set(uid, []);
        windowByUser.get(uid).push(sh);
      }
    }

    const byUserWeek = new Map();
    for (const sh of shiftsInWeek) {
      for (const uid of getAssigneeIdsFromShiftDoc(sh)) {
        if (!byUserWeek.has(uid)) byUserWeek.set(uid, []);
        byUserWeek.get(uid).push(sh);
      }
    }

    const baseRate = getBaseHourlyRate();
    const nameRows = await User.find({ _id: { $in: [...byUserWeek.keys()] } })
      .select("name")
      .lean();
    const nameMap = new Map(nameRows.map((r) => [r._id.toString(), r.name]));

    const employees = [];

    for (const [uid, weekList] of byUserWeek) {
      const ot = shiftsContributingToOvertime(weekList, weekStart);
      const name = nameMap.get(uid) || "Unknown";
      const windowList = windowByUser.get(uid) || [];
      const snap = analyzeLaborCompliance(windowList, null, {});
      employees.push({
        userId: uid,
        name,
        totalHoursInWeek: ot.totalHours,
        overtimeHours: ot.overtimeHours,
        estimatedWeekCost: ot.estimatedCost,
        shiftsPushingOvertime: ot.shiftIds,
        laborWarnings: snap.warnings,
      });
    }

    employees.sort((a, b) => b.overtimeHours - a.overtimeHours);

    return NextResponse.json({
      weekStart: weekStart.toISOString(),
      weekEndExclusive: weekEnd.toISOString(),
      baseRatePerHour: baseRate,
      overtimeMultiplier: OT_MULTIPLIER,
      note: "UTC calendar rules; see README.",
      employees,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
