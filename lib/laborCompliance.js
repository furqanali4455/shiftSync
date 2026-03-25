import Shift from "@/models/Shift";

export const DAILY_WARN_HOURS = 8;
export const DAILY_BLOCK_HOURS = 12;
export const WEEKLY_WARN_HOURS = 35;
export const WEEKLY_REGULAR_CAP = 40;
export const OT_MULTIPLIER = 1.5;

export function getBaseHourlyRate() {
  const n = parseFloat(process.env.LABOR_BASE_RATE || "20");
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function splitShiftHoursByUtcDay(start, end) {
  const out = {};
  let cur = new Date(start);
  const endMs = end.getTime();
  if (!(cur.getTime() < endMs)) return out;

  while (cur.getTime() < endMs) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    const nextUtcMidnight = Date.UTC(
      cur.getUTCFullYear(),
      cur.getUTCMonth(),
      cur.getUTCDate() + 1,
    );
    const chunkEnd = Math.min(endMs, nextUtcMidnight);
    const hrs = (chunkEnd - cur.getTime()) / 3600000;
    out[key] = (out[key] || 0) + hrs;
    cur = new Date(chunkEnd);
  }
  return out;
}

function utcDayIndex(ymd) {
  const [y, mo, d] = ymd.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) / 86400000;
}

export function maxConsecutiveWorkDays(dayKeys) {
  const withWork = dayKeys.filter(Boolean);
  if (withWork.length === 0) return 0;
  const indices = [...new Set(withWork.map(utcDayIndex))].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) run++;
    else run = 1;
    best = Math.max(best, run);
  }
  return best;
}

export function startOfIsoWeekUtc(date) {
  const d = new Date(date);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(utc).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const weekStart = new Date(utc);
  weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

export function endOfIsoWeekUtcExclusive(weekStart) {
  const end = new Date(weekStart.getTime());
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

export function overlapHours(startA, endA, startB, endB) {
  const s = Math.max(new Date(startA).getTime(), new Date(startB).getTime());
  const e = Math.min(new Date(endA).getTime(), new Date(endB).getTime());
  return Math.max(0, (e - s) / 3600000);
}

export function hoursPerIsoWeekUtc(shifts, weekStart) {
  const weekEnd = endOfIsoWeekUtcExclusive(weekStart);
  let total = 0;
  for (const sh of shifts) {
    total += overlapHours(sh.startTime, sh.endTime, weekStart, weekEnd);
  }
  return total;
}

function mergeDailyHoursFromShifts(shifts, proposed, excludeShiftId) {
  const merged = {};
  for (const sh of shifts) {
    if (excludeShiftId && String(sh._id) === String(excludeShiftId)) continue;
    const s = new Date(sh.startTime);
    const e = new Date(sh.endTime);
    const part = splitShiftHoursByUtcDay(s, e);
    for (const [k, v] of Object.entries(part)) {
      merged[k] = (merged[k] || 0) + v;
    }
  }
  if (proposed) {
    const part = splitShiftHoursByUtcDay(
      new Date(proposed.startTime),
      new Date(proposed.endTime),
    );
    for (const [k, v] of Object.entries(part)) {
      merged[k] = (merged[k] || 0) + v;
    }
  }
  return merged;
}

export function shiftsContributingToOvertime(shiftsInWeek, weekStart) {
  const weekEnd = endOfIsoWeekUtcExclusive(weekStart);
  const sorted = [...shiftsInWeek].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime),
  );
  let running = 0;
  const shiftIds = [];
  for (const sh of sorted) {
    const dur = overlapHours(sh.startTime, sh.endTime, weekStart, weekEnd);
    if (dur <= 0) continue;
    const next = running + dur;
    if (next > WEEKLY_REGULAR_CAP + 1e-9) {
      shiftIds.push(String(sh._id));
    }
    running = next;
  }
  const otH = Math.max(0, running - WEEKLY_REGULAR_CAP);
  const base = getBaseHourlyRate();
  const regH = Math.min(running, WEEKLY_REGULAR_CAP);
  const estimatedCost =
    Math.round((regH * base + otH * base * OT_MULTIPLIER) * 100) / 100;
  return {
    totalHours: Math.round(running * 100) / 100,
    overtimeHours: Math.round(otH * 100) / 100,
    estimatedCost,
    shiftIds,
  };
}

function collectIsoWeeksTouchingRange(rangeStart, rangeEnd) {
  const weeks = new Map();
  let cur = startOfIsoWeekUtc(rangeStart);
  const endMs = rangeEnd.getTime();
  while (cur.getTime() < endMs) {
    const key = cur.toISOString().slice(0, 10);
    weeks.set(key, new Date(cur.getTime()));
    cur = new Date(cur.getTime());
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return [...weeks.values()];
}

export function analyzeLaborCompliance(existingShifts, proposedShift, options = {}) {
  const { excludeShiftId = null } = options;
  const warnings = [];
  const blocks = [];

  const allForWeeks = [];
  for (const sh of existingShifts) {
    if (excludeShiftId && String(sh._id) === String(excludeShiftId)) continue;
    allForWeeks.push(sh);
  }
  if (proposedShift) {
    allForWeeks.push({
      _id: "proposed",
      startTime: proposedShift.startTime,
      endTime: proposedShift.endTime,
    });
  }

  const rangeStart = allForWeeks.length
    ? new Date(
        Math.min(...allForWeeks.map((s) => new Date(s.startTime).getTime())),
      )
    : new Date();
  const rangeEnd = allForWeeks.length
    ? new Date(
        Math.max(...allForWeeks.map((s) => new Date(s.endTime).getTime())),
      )
    : new Date();
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 21);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 21);

  const mergedDaily = mergeDailyHoursFromShifts(
    existingShifts,
    proposedShift,
    excludeShiftId,
  );

  for (const [day, hrs] of Object.entries(mergedDaily)) {
    if (hrs > DAILY_BLOCK_HOURS + 1e-9) {
      blocks.push({
        code: "DAILY_TWELVE_HOUR_BLOCK",
        message: `This assignment would exceed ${DAILY_BLOCK_HOURS} hours on ${day} (UTC calendar day) for this employee (${hrs.toFixed(1)}h). Manager override with a documented reason is required.`,
        day,
        hours: hrs,
      });
    } else if (hrs > DAILY_WARN_HOURS + 1e-9) {
      warnings.push({
        code: "DAILY_EIGHT_HOUR_WARNING",
        message: `Projected ${hrs.toFixed(1)} hours on ${day} (UTC) — exceeds the ${DAILY_WARN_HOURS}h daily warning threshold.`,
        day,
        hours: hrs,
      });
    }
  }

  const workedDays = Object.entries(mergedDaily)
    .filter(([, h]) => h > 1e-6)
    .map(([k]) => k);
  const streak = maxConsecutiveWorkDays(workedDays);
  if (streak >= 7) {
    blocks.push({
      code: "SEVENTH_CONSECUTIVE_DAY",
      message:
        "This would be a 7th consecutive calendar day (UTC) with scheduled work. Manager override with a documented reason is required.",
      consecutiveDays: streak,
    });
  } else if (streak === 6) {
    warnings.push({
      code: "SIXTH_CONSECUTIVE_DAY_WARNING",
      message:
        "Employee would work 6 consecutive calendar days (UTC). Review for fatigue and labor compliance.",
      consecutiveDays: streak,
    });
  }

  const weekStarts = collectIsoWeeksTouchingRange(rangeStart, rangeEnd);
  const weeklyDetail = [];
  for (const ws of weekStarts) {
    const h = hoursPerIsoWeekUtc(allForWeeks, ws);
    if (h < 1e-6) continue;
    const weekEnd = endOfIsoWeekUtcExclusive(ws);
    weeklyDetail.push({
      weekStart: ws.toISOString(),
      weekEnd: weekEnd.toISOString(),
      hours: Math.round(h * 100) / 100,
    });
    if (h >= WEEKLY_WARN_HOURS && h <= WEEKLY_REGULAR_CAP + 1e-9) {
      warnings.push({
        code: "WEEKLY_APPROACHING_OVERTIME",
        message: `ISO week starting ${ws.toISOString().slice(0, 10)} reaches ${h.toFixed(1)}h (warning at ${WEEKLY_WARN_HOURS}+h toward the ${WEEKLY_REGULAR_CAP}h regular cap).`,
        weekStart: ws.toISOString(),
        hours: h,
      });
    } else if (h > WEEKLY_REGULAR_CAP + 1e-9) {
      const otH = h - WEEKLY_REGULAR_CAP;
      warnings.push({
        code: "WEEKLY_OVERTIME_PROJECTION",
        message: `Projected ${h.toFixed(1)}h in ISO week starting ${ws.toISOString().slice(0, 10)} — about ${otH.toFixed(1)}h over the ${WEEKLY_REGULAR_CAP}h regular cap (overtime rates apply to modeled costs).`,
        weekStart: ws.toISOString(),
        hours: h,
        overtimeHours: otH,
      });
    }
  }

  return {
    warnings,
    blocks,
    mergedDailyHours: mergedDaily,
    weeklyHours: weeklyDetail,
    maxConsecutiveDays: streak,
  };
}

export function estimateWeeklyLaborCost(regularHours, overtimeHours) {
  const base = getBaseHourlyRate();
  const reg = Math.min(regularHours, WEEKLY_REGULAR_CAP);
  const ot = Math.max(0, overtimeHours);
  const pay = reg * base + ot * base * OT_MULTIPLIER;
  return Math.round(pay * 100) / 100;
}

export async function evaluateLaborForAssignment(
  userId,
  startTime,
  endTime,
  { excludeShiftId = null } = {},
) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const rangeStart = new Date(start.getTime() - 21 * 86400000);
  const rangeEnd = new Date(end.getTime() + 21 * 86400000);

  const existing = await Shift.find({
    $or: [{ user: userId }, { assignedUsers: userId }],
    startTime: { $lt: rangeEnd },
    endTime: { $gt: rangeStart },
  })
    .select("startTime endTime _id")
    .lean();

  const proposed = { startTime: start, endTime: end };
  return analyzeLaborCompliance(existing, proposed, { excludeShiftId });
}

export function laborOverrideValid(override) {
  if (!override || typeof override !== "object") return false;
  const reason = typeof override.reason === "string" ? override.reason.trim() : "";
  return reason.length >= 8;
}

