/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import {
  splitShiftHoursByUtcDay,
  maxConsecutiveWorkDays,
  analyzeLaborCompliance,
  startOfIsoWeekUtc,
  shiftsContributingToOvertime,
  WEEKLY_REGULAR_CAP,
} from "@/lib/laborCompliance";

describe("splitShiftHoursByUtcDay", () => {
  it("splits an overnight shift across two UTC days", () => {
    const start = new Date("2025-06-10T22:00:00.000Z");
    const end = new Date("2025-06-11T06:00:00.000Z");
    const m = splitShiftHoursByUtcDay(start, end);
    expect(m["2025-06-10"]).toBeCloseTo(2, 5);
    expect(m["2025-06-11"]).toBeCloseTo(6, 5);
  });
});

describe("maxConsecutiveWorkDays", () => {
  it("counts longest UTC streak", () => {
    expect(maxConsecutiveWorkDays(["2025-01-01", "2025-01-02", "2025-01-03"])).toBe(3);
    expect(maxConsecutiveWorkDays(["2025-01-01", "2025-01-03"])).toBe(1);
  });
});

describe("analyzeLaborCompliance", () => {
  it("blocks when daily hours exceed 12", () => {
    const existing = [
      {
        _id: "a",
        startTime: new Date("2025-06-10T10:00:00.000Z"),
        endTime: new Date("2025-06-10T20:00:00.000Z"),
      },
    ];
    const proposed = {
      startTime: new Date("2025-06-10T20:00:00.000Z"),
      endTime: new Date("2025-06-11T04:00:00.000Z"),
    };
    const r = analyzeLaborCompliance(existing, proposed, {});
    expect(r.blocks.some((b) => b.code === "DAILY_TWELVE_HOUR_BLOCK")).toBe(true);
  });

  it("warns at 35+ hours in an ISO week", () => {
    const existing = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.UTC(2025, 5, 9 + i, 8, 0, 0));
      existing.push({
        _id: `s${i}`,
        startTime: d,
        endTime: new Date(d.getTime() + 8 * 3600000),
      });
    }
    const r = analyzeLaborCompliance(existing, null, {});
    expect(r.warnings.some((w) => w.code === "WEEKLY_APPROACHING_OVERTIME")).toBe(true);
  });
});

describe("shiftsContributingToOvertime", () => {
  it("flags shifts that push cumulative hours past the regular cap", () => {
    const weekStart = startOfIsoWeekUtc(new Date(Date.UTC(2025, 5, 9, 12, 0, 0)));
    const shifts = [
      {
        _id: "x1",
        startTime: new Date(Date.UTC(2025, 5, 9, 8, 0, 0)),
        endTime: new Date(Date.UTC(2025, 5, 9, 28, 0, 0)),
      },
      {
        _id: "x2",
        startTime: new Date(Date.UTC(2025, 5, 10, 8, 0, 0)),
        endTime: new Date(Date.UTC(2025, 5, 10, 28, 0, 0)),
      },
      {
        _id: "x3",
        startTime: new Date(Date.UTC(2025, 5, 11, 0, 0, 0)),
        endTime: new Date(Date.UTC(2025, 5, 11, 5, 0, 0)),
      },
    ];
    const r = shiftsContributingToOvertime(shifts, weekStart);
    expect(r.totalHours).toBeGreaterThan(WEEKLY_REGULAR_CAP);
    expect(r.shiftIds.length).toBeGreaterThan(0);
  });
});
