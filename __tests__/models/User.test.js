import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("mongoose", () => {
  const SchemaClass = vi.fn(function () {
    this._options = {};
    this.set = vi.fn((key, value) => { this._options[key] = value; });
  });
  SchemaClass.Types = { ObjectId: "ObjectId" };
  return {
    default: {
      Schema: SchemaClass,
      models: {},
      model: vi.fn((name) => `MockModel_${name}`),
    },
  };
});

describe("User model toJSON transform", () => {
  it("strips password and __v from JSON output", async () => {
    vi.resetModules();
    const mongoose = (await import("mongoose")).default;
    await import("@/models/User.js");

    const schemaInstance = mongoose.Schema.mock.instances[0];
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
