import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/models/Shift", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("@/models/User", () => ({
  default: { findById: vi.fn(() => ({ lean: vi.fn() })) },
}));

describe("checkConflicts", () => {
  let checkConflicts, MockUser, MockShift;

  beforeEach(async () => {
    vi.resetModules();
    const conflictsMod = await import("@/lib/conflicts.js");
    checkConflicts = conflictsMod.checkConflicts;

    const userMod = await import("@/models/User.js");
    MockUser = userMod.default;

    const shiftMod = await import("@/models/Shift.js");
    MockShift = shiftMod.default;

    MockUser.findById.mockReset();
    MockUser.findById.mockImplementation(() => ({ lean: vi.fn().mockResolvedValue(null) }));
    MockShift.findOne.mockReset();
  });

  function stubUser(doc) {
    MockUser.findById.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(doc),
    }));
  }

  it("returns conflict if user is not found", async () => {
    stubUser(null);
    const result = await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service");
    expect(result.hasConflict).toBe(true);
    expect(result.message).toContain("User not found");
  });

  it("returns conflict if user lacks the required skill", async () => {
    stubUser({
      skills: ["Cooking"],
      locations: [{ toString: () => "loc1" }],
    });
    const result = await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service");
    expect(result.hasConflict).toBe(true);
    expect(result.message).toContain("lacks required skill");
  });

  it("returns conflict if user is not certified for the location", async () => {
    stubUser({
      skills: ["Service"],
      locations: [{ toString: () => "loc2" }],
    });
    const result = await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service");
    expect(result.hasConflict).toBe(true);
    expect(result.message).toContain("not certified");
  });

  it("returns conflict on overlapping shift", async () => {
    stubUser({
      skills: ["Service"],
      locations: [{ toString: () => "loc1" }],
    });
    MockShift.findOne.mockResolvedValueOnce({ _id: "overlap_shift" }); // overlap check
    const result = await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service");
    expect(result.hasConflict).toBe(true);
    expect(result.message).toContain("already scheduled");
  });

  it("returns conflict for less than 10-hour rest gap", async () => {
    stubUser({
      skills: ["Service"],
      locations: [{ toString: () => "loc1" }],
    });
    MockShift.findOne
      .mockResolvedValueOnce(null)  // no overlap
      .mockResolvedValueOnce({ _id: "nearby_shift" });  // rest gap violated
    const result = await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service");
    expect(result.hasConflict).toBe(true);
    expect(result.message).toContain("10 hours of rest");
  });

  it("returns no conflict when all checks pass", async () => {
    stubUser({
      skills: ["Service"],
      locations: [{ toString: () => "loc1" }],
    });
    MockShift.findOne.mockResolvedValue(null);
    const result = await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service");
    expect(result.hasConflict).toBe(false);
  });

  it("excludes current shift when shiftId is provided", async () => {
    stubUser({
      skills: ["Service"],
      locations: [{ toString: () => "loc1" }],
    });
    MockShift.findOne.mockResolvedValue(null);
    await checkConflicts("user1", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z", "loc1", "Service", "shift123");

    const overlapCall = MockShift.findOne.mock.calls[0][0];
    expect(overlapCall.$or).toBeDefined();
    expect(overlapCall._id).toEqual({ $ne: "shift123" });
  });
});
