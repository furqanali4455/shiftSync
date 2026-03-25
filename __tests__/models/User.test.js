import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("mongoose", () => {
  const schemaInstances = [];
  class SchemaMock {
    constructor() {
      this.set = vi.fn();
      schemaInstances.push(this);
    }
  }
  SchemaMock.Types = { ObjectId: "ObjectId" };
  SchemaMock._testInstances = schemaInstances;
  return {
    default: {
      Schema: SchemaMock,
      models: {},
      model: vi.fn((name) => `MockModel_${name}`),
    },
  };
});

describe("User model toJSON transform", () => {
  it("strips password and __v from JSON output", async () => {
    vi.resetModules();
    const mongoose = (await import("mongoose")).default;
    mongoose.Schema._testInstances.length = 0;
    await import("@/models/User.js");

    const schemaInstance = mongoose.Schema._testInstances.find((s) =>
      s.set.mock.calls.some((c) => c[0] === "toJSON"),
    );
    expect(schemaInstance).toBeDefined();
    expect(schemaInstance.set).toHaveBeenCalledWith("toJSON", expect.any(Object));

    const toJSONConfig = schemaInstance.set.mock.calls.find((c) => c[0] === "toJSON")[1];
    const transform = toJSONConfig.transform;

    const mockDoc = {};
    const mockRet = {
      _id: "123",
      name: "Test User",
      email: "test@test.com",
      password: "$2a$12$hashvalue",
      __v: 0,
      role: "Staff",
    };

    const result = transform(mockDoc, { ...mockRet });
    expect(result.password).toBeUndefined();
    expect(result.__v).toBeUndefined();
    expect(result.name).toBe("Test User");
    expect(result.email).toBe("test@test.com");
    expect(result.role).toBe("Staff");
  });
});
