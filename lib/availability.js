import { format, toZonedTime } from "date-fns-tz";

function localDayKey(utcDate, tz) {
  return format(toZonedTime(utcDate, tz), "yyyy-MM-dd", { timeZone: tz });
}

function localDow(utcDate, tz) {
  return toZonedTime(utcDate, tz).getDay();
}

function minutesFromUtcInTz(utcDate, tz) {
  const z = toZonedTime(utcDate, tz);
  return z.getHours() * 60 + z.getMinutes();
}

export function splitShiftIntoLocalDaySegments(start, end, tz) {
  const segments = [];
  let cur = new Date(start);
  const endMs = new Date(end).getTime();
  while (cur.getTime() < endMs) {
    const dayKey = localDayKey(cur, tz);
    let probe = new Date(cur);
    while (probe.getTime() < endMs && localDayKey(probe, tz) === dayKey) {
      probe = new Date(probe.getTime() + 60000);
    }
    const segEndMs = Math.min(probe.getTime(), endMs);
    const lastTick = new Date(Math.max(segEndMs - 1, cur.getTime()));
    segments.push({
      dayKey,
      dow: localDow(cur, tz),
      startMinute: minutesFromUtcInTz(cur, tz),
      endMinute: minutesFromUtcInTz(lastTick, tz) + 1,
      startUtc: new Date(cur.getTime()),
      endUtc: new Date(segEndMs),
    });
    cur = new Date(segEndMs);
  }
  return segments;
}

function exceptionBlocksDay(user, dayKey) {
  const ex = user.availabilityExceptions || [];
  for (const row of ex) {
    const d = new Date(row.date);
    const key = format(toZonedTime(d, user.timezone || "UTC"), "yyyy-MM-dd", {
      timeZone: user.timezone || "UTC",
    });
    if (key !== dayKey) continue;
    if (row.unavailableAllDay) return true;
  }
  return false;
}

function recurringAllows(dow, startMin, endMin, slots) {
  if (!slots || slots.length === 0) return true;
  for (const s of slots) {
    if (s.dayOfWeek !== dow) continue;
    const a = s.startMinute;
    const b = s.endMinute;
    if (a < b) {
      if (startMin >= a && endMin <= b) return true;
      if (startMin < b && endMin > a) return true;
    }
  }
  return false;
}

export function isUserAvailableForShift(user, shiftStart, shiftEnd) {
  const slots = user.recurringAvailability;
  if (!slots || slots.length === 0) {
    return { ok: true };
  }
  const tz = user.timezone || "America/New_York";
  const segments = splitShiftIntoLocalDaySegments(shiftStart, shiftEnd, tz);
  for (const seg of segments) {
    if (exceptionBlocksDay(user, seg.dayKey)) {
      return {
        ok: false,
        message:
          "Staff marked unavailable (exception) for part of this shift in their timezone.",
      };
    }
    if (!recurringAllows(seg.dow, seg.startMinute, seg.endMinute, slots)) {
      return {
        ok: false,
        message:
          "Outside recurring availability for this staff member (see their profile timezone).",
      };
    }
  }
  return { ok: true };
}
