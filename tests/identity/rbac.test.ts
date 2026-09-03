import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UserRole } from "@prisma/client";
import { hasRole, requireAdmin, requireModerator } from "@/modules/identity/rbac";

const getCurrentUserMock = vi.fn();
vi.mock("@/modules/identity/session", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const ROLES: UserRole[] = ["INDIVIDUAL", "BUSINESS", "MODERATOR", "ADMIN"];

describe("hasRole", () => {
  it("returns true when the role is present in the allowed list", () => {
    expect(hasRole("ADMIN", ["ADMIN"])).toBe(true);
    expect(hasRole("MODERATOR", ["ADMIN", "MODERATOR"])).toBe(true);
  });

  it("returns false when the role is absent from the allowed list", () => {
    expect(hasRole("INDIVIDUAL", ["ADMIN"])).toBe(false);
    expect(hasRole("BUSINESS", ["ADMIN", "MODERATOR"])).toBe(false);
  });

  it("returns false for every role when the allowed list is empty", () => {
    for (const role of ROLES) {
      expect(hasRole(role, [])).toBe(false);
    }
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("returns null when there is no current user", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect(await requireAdmin()).toBeNull();
  });

  it("returns null for a MODERATOR (insufficient role)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "MODERATOR" });
    expect(await requireAdmin()).toBeNull();
  });

  it("returns the user for ADMIN", async () => {
    const user = { id: "u1", role: "ADMIN" };
    getCurrentUserMock.mockResolvedValue(user);
    expect(await requireAdmin()).toEqual(user);
  });
});

describe("requireModerator", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("returns null when there is no current user", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect(await requireModerator()).toBeNull();
  });

  it("returns null for an INDIVIDUAL (insufficient role)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "INDIVIDUAL" });
    expect(await requireModerator()).toBeNull();
  });

  it("returns the user for MODERATOR (the looser gate)", async () => {
    const user = { id: "u1", role: "MODERATOR" };
    getCurrentUserMock.mockResolvedValue(user);
    expect(await requireModerator()).toEqual(user);
  });

  it("returns the user for ADMIN too", async () => {
    const user = { id: "u1", role: "ADMIN" };
    getCurrentUserMock.mockResolvedValue(user);
    expect(await requireModerator()).toEqual(user);
  });
});
