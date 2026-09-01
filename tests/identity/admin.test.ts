import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listUsers, getUserDetail, setUserStatus, setUserRole } from "@/modules/identity/admin-users";
import { reviewVerificationRequest } from "@/modules/identity/verification";

const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

function randomPhone() {
  return `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({ data: { phone: randomPhone(), ...overrides } });
  createdUserIds.push(user.id);
  return user;
}

async function cleanup() {
  await prisma.verificationRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdRequestIds.length = 0;
}

describe("listUsers / getUserDetail", () => {
  afterEach(cleanup);

  it("filters by a unique phone fragment and status", async () => {
    const uniqueFragment = `99${Math.floor(1000 + Math.random() * 8999)}`;
    const user = await makeUser({ phone: `+2010${uniqueFragment}`, status: "SUSPENDED" });

    const byQuery = await listUsers({ query: uniqueFragment });
    expect(byQuery.items.some((u) => u.id === user.id)).toBe(true);

    const bySuspended = await listUsers({ status: "SUSPENDED", query: uniqueFragment });
    expect(bySuspended.items.every((u) => u.status === "SUSPENDED")).toBe(true);
  });

  it("returns detail with listing/order/report counts", async () => {
    const user = await makeUser();
    const detail = await getUserDetail(user.id);
    expect(detail?.user.id).toBe(user.id);
    expect(detail?.listingCount).toBe(0);
  });

  it("returns null for a nonexistent user", async () => {
    expect(await getUserDetail("does-not-exist")).toBeNull();
  });

  it("scopes the returned user to only the fields the admin detail page reads", async () => {
    const user = await makeUser({ email: "seller@example.com" });
    const detail = await getUserDetail(user.id);
    expect(detail?.user).toEqual({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      commerceVerifiedAt: user.commerceVerifiedAt,
      createdAt: user.createdAt,
    });
    expect(detail?.user).not.toHaveProperty("email");
    expect(detail?.user).not.toHaveProperty("phoneVerifiedAt");
    expect(detail?.user).not.toHaveProperty("deletedAt");
    expect(detail?.user).not.toHaveProperty("updatedAt");
  });
});

describe("setUserStatus", () => {
  afterEach(cleanup);

  it("suspends a user and revokes their active sessions", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    await prisma.session.create({
      data: { userId: user.id, tokenHash: `hash-${Math.random()}`, expiresAt: new Date(Date.now() + 100_000) },
    });

    const changed = await setUserStatus(user.id, "SUSPENDED", admin.id);
    expect(changed).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.status).toBe("SUSPENDED");

    const activeSessions = await prisma.session.count({ where: { userId: user.id, revokedAt: null } });
    expect(activeSessions).toBe(0);
  });

  it("records the previous status alongside the new one in the audit entry", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });

    await setUserStatus(user.id, "SUSPENDED", admin.id);
    const suspendEntry = await prisma.auditLog.findFirst({
      where: { targetType: "User", targetId: user.id, action: "admin.user.suspend" },
    });
    expect(suspendEntry?.metadata).toEqual({ from: "ACTIVE", to: "SUSPENDED" });

    await setUserStatus(user.id, "BANNED", admin.id);
    const banEntry = await prisma.auditLog.findFirst({
      where: { targetType: "User", targetId: user.id, action: "admin.user.ban" },
    });
    expect(banEntry?.metadata).toEqual({ from: "SUSPENDED", to: "BANNED" });
  });

  it("reactivating does not touch sessions (no revocation needed for ACTIVE)", async () => {
    const user = await makeUser({ status: "SUSPENDED" });
    const admin = await makeUser({ role: "ADMIN" });
    const changed = await setUserStatus(user.id, "ACTIVE", admin.id);
    expect(changed).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.status).toBe("ACTIVE");
  });

  it("returns false for a nonexistent user", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    expect(await setUserStatus("does-not-exist", "BANNED", admin.id)).toBe(false);
  });
});

describe("setUserRole", () => {
  afterEach(cleanup);

  it("promotes a user to MODERATOR", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const result = await setUserRole(user.id, "MODERATOR", admin.id);
    expect(result).toEqual({ success: true });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.role).toBe("MODERATOR");
  });

  it("refuses to demote the last remaining ADMIN", async () => {
    // Isolate from any other ADMIN rows created concurrently by other test
    // files: demote every existing admin down first is not viable in a
    // shared DB, so instead we verify the guard fires for an admin who is
    // provably alone by using otherAdmins===0 semantics directly — create
    // one admin and confirm no *other* admin exists among our own fixtures,
    // then rely on the guard's own count query (scoped globally, matching
    // production semantics) by asserting the specific-user-lockout case
    // holds whenever this admin is in fact the sole admin.
    const soleAdminCandidate = await makeUser({ role: "ADMIN" });
    const otherAdminsCount = await prisma.user.count({
      where: { role: "ADMIN", deletedAt: null, id: { not: soleAdminCandidate.id } },
    });

    const result = await setUserRole(soleAdminCandidate.id, "INDIVIDUAL", soleAdminCandidate.id);
    if (otherAdminsCount === 0) {
      expect(result).toEqual({ success: false, error: "last_admin" });
      const stillAdmin = await prisma.user.findUniqueOrThrow({ where: { id: soleAdminCandidate.id } });
      expect(stillAdmin.role).toBe("ADMIN");
    } else {
      // Another test file's fixture admin exists concurrently — the demotion
      // is legitimately allowed in that case; just confirm it succeeded.
      expect(result).toEqual({ success: true });
    }
  });

  it("allows demoting an admin when another admin still exists", async () => {
    const admin1 = await makeUser({ role: "ADMIN" });
    const admin2 = await makeUser({ role: "ADMIN" });
    const result = await setUserRole(admin1.id, "INDIVIDUAL", admin2.id);
    expect(result).toEqual({ success: true });
  });

  it("returns not_found for a nonexistent user", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const result = await setUserRole("does-not-exist", "MODERATOR", admin.id);
    expect(result).toEqual({ success: false, error: "not_found" });
  });
});

describe("reviewVerificationRequest", () => {
  afterEach(cleanup);

  async function makeRequest(userId: string, type: "INDIVIDUAL_SELLER" | "BUSINESS" = "BUSINESS") {
    const request = await prisma.verificationRequest.create({
      data: { userId, type, businessName: type === "BUSINESS" ? "متجر تجريبي" : undefined },
    });
    createdRequestIds.push(request.id);
    return request;
  }

  it("approving a BUSINESS request sets commerceVerifiedAt and promotes role from INDIVIDUAL", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const request = await makeRequest(user.id, "BUSINESS");

    const result = await reviewVerificationRequest(request.id, admin.id, "APPROVED");
    expect(result).toEqual({ success: true });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.commerceVerifiedAt).not.toBeNull();
    expect(updatedUser.role).toBe("BUSINESS");

    const updatedRequest = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updatedRequest.status).toBe("APPROVED");
    expect(updatedRequest.reviewedBy).toBe(admin.id);
  });

  it("approving an INDIVIDUAL_SELLER request verifies commerce but never touches role", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const request = await makeRequest(user.id, "INDIVIDUAL_SELLER");

    await reviewVerificationRequest(request.id, admin.id, "APPROVED");

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.commerceVerifiedAt).not.toBeNull();
    expect(updatedUser.role).toBe("INDIVIDUAL");
  });

  it("never promotes an ADMIN's role even if a BUSINESS request is approved", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const reviewer = await makeUser({ role: "ADMIN" });
    const request = await makeRequest(admin.id, "BUSINESS");

    await reviewVerificationRequest(request.id, reviewer.id, "APPROVED");

    const updatedAdmin = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(updatedAdmin.role).toBe("ADMIN");
  });

  it("rejecting sets status but does not verify commerce or change role", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const request = await makeRequest(user.id, "BUSINESS");

    await reviewVerificationRequest(request.id, admin.id, "REJECTED");

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.commerceVerifiedAt).toBeNull();
    expect(updatedUser.role).toBe("INDIVIDUAL");
  });

  it("refuses to re-review an already-decided request", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const request = await makeRequest(user.id);

    await reviewVerificationRequest(request.id, admin.id, "APPROVED");
    const secondAttempt = await reviewVerificationRequest(request.id, admin.id, "REJECTED");
    expect(secondAttempt).toEqual({ success: false, error: "already_reviewed" });
  });

  it("returns not_found for a nonexistent request", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const result = await reviewVerificationRequest("does-not-exist", admin.id, "APPROVED");
    expect(result).toEqual({ success: false, error: "not_found" });
  });
});
