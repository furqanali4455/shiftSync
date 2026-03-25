import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import User from "@/models/User";
import { requireRole } from "@/lib/auth";
import { loadActor, managerLocationObjectIds } from "@/lib/actor";
import { toZonedTime } from "date-fns-tz";
import { getAssigneeIdsFromShiftDoc } from "@/lib/shiftPayload";

function isPremiumShift(shift, tz) {
  const s = toZonedTime(new Date(shift.startTime), tz);
  const dow = s.getDay();
  const h = s.getHours() + s.getMinutes() / 60;
  const isWeekend = dow === 5 || dow === 6;
  const evening = h >= 17;
  return isWeekend && evening;
}

export async function GET(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from")
      ? new Date(searchParams.get("from"))
      : new Date(Date.now() - 30 * 86400000);
    const to = searchParams.get("to") ? new Date(searchParams.get("to")) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }

    await connectDB();

    const q = {
      startTime: { $lt: to },
      endTime: { $gt: from },
      $or: [{ user: { $ne: null } }, { "assignedUsers.0": { $exists: true } }],
    };
    if (actor.role === "Manager") {
      const lids = managerLocationObjectIds(actor);
      if (!lids?.length) {
        return NextResponse.json({ from, to, staff: [], fairnessNote: "" });
      }
      q.location = { $in: lids };
    }

    const shifts = await Shift.find(q).populate("location").lean();

    const byUser = new Map();
    for (const sh of shifts) {
      const tz = sh.location?.timezone || "UTC";
      const hrs = (new Date(sh.endTime) - new Date(sh.startTime)) / 3600000;
      const premium = isPremiumShift(sh, tz);
      const ids = getAssigneeIdsFromShiftDoc(sh);
      for (const uid of ids) {
        if (!byUser.has(uid)) {
          byUser.set(uid, { totalHours: 0, premiumHours: 0, premiumCount: 0, shiftCount: 0 });
        }
        const row = byUser.get(uid);
        row.totalHours += hrs;
        row.shiftCount += 1;
        if (premium) {
          row.premiumHours += hrs;
          row.premiumCount += 1;
        }
      }
    }

    const users = await User.find({
      _id: { $in: [...byUser.keys()] },
    })
      .select("name desiredHoursPerWeek")
      .lean();

    const umap = new Map(users.map((u) => [u._id.toString(), u]));

    const premiumShares = [...byUser.values()].map((v) => v.premiumHours);
    const avgPremium =
      premiumShares.length > 0
        ? premiumShares.reduce((a, b) => a + b, 0) / premiumShares.length
        : 0;
    let varSum = 0;
    for (const p of premiumShares) {
      varSum += (p - avgPremium) ** 2;
    }
    const fairnessScore =
      premiumShares.length > 1 ? Math.max(0, 100 - Math.sqrt(varSum / premiumShares.length) * 10) : 100;

    const staff = [...byUser.entries()].map(([userId, m]) => {
      const u = umap.get(userId);
      const desired = u?.desiredHoursPerWeek;
      const delta =
        desired != null ? Math.round((m.totalHours - desired) * 10) / 10 : null;
      return {
        userId,
        name: u?.name || "Unknown",
        totalHours: Math.round(m.totalHours * 10) / 10,
        premiumHours: Math.round(m.premiumHours * 10) / 10,
        premiumShiftCount: m.premiumCount,
        shiftCount: m.shiftCount,
        desiredHoursPerWeek: desired,
        hoursVsDesiredDelta: delta,
      };
    });

    staff.sort((a, b) => b.premiumHours - a.premiumHours);

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      premiumDefinition: "Friday/Saturday local start time from 17:00 at shift location.",
      fairnessScore: Math.round(fairnessScore * 10) / 10,
      fairnessNote:
        "Higher score means premium hours are more evenly spread (heuristic variance-based).",
      staff,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
