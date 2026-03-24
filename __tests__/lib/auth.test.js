/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
});

describe("Auth utilities", () => {
  let createToken, verifyToken;

  beforeAll(async () => {
    const mod = await import("@/lib/auth.js");
    createToken = mod.createToken;
    verifyToken = mod.verifyToken;
  });

  it("creates a valid JWT token", async () => {
    const token = await createToken({ id: "user123", email: "test@test.com", role: "Admin" });
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifies a valid token and returns payload", async () => {
    const token = await createToken({ id: "user123", email: "test@test.com", role: "Staff" });
    const payload = await verifyToken(token);
    expect(payload).toBeDefined();
    expect(payload.id).toBe("user123");
    expect(payload.email).toBe("test@test.com");
    expect(payload.role).toBe("Staff");
  });

  it("returns null for an invalid token", async () => {
    const payload = await verifyToken("invalid.token.here");
    expect(payload).toBeNull();
  });

  it("returns null for an empty token", async () => {
    const payload = await verifyToken("");
    expect(payload).toBeNull();
  });

  it("token contains expiration claim", async () => {
    const token = await createToken({ id: "user123", email: "a@b.com", role: "Admin" });
    const payload = await verifyToken(token);
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("preserves all custom payload fields", async () => {
    const data = { id: "abc", email: "abc@example.com", role: "Manager" };
    const token = await createToken(data);
    const payload = await verifyToken(token);
    expect(payload.id).toBe(data.id);
    expect(payload.email).toBe(data.email);
    expect(payload.role).toBe(data.role);
  });
});

describe("requireRole", () => {
  let requireRole;

  beforeAll(async () => {
    const mod = await import("@/lib/auth.js");
    requireRole = mod.requireRole;
  });

  it("returns null when user has the required role", () => {
    const mockRequest = { headers: { get: (key) => key === "x-user-role" ? "Admin" : null } };
    expect(requireRole(mockRequest, "Admin", "Manager")).toBeNull();
  });

  it("returns error when user lacks the required role", () => {
    const mockRequest = { headers: { get: (key) => key === "x-user-role" ? "Staff" : null } };
    const result = requireRole(mockRequest, "Admin", "Manager");
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
    expect(result.error).toContain("Insufficient");
  });
});
