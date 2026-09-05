import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/modules/identity/session";
import {
  submitAccountDeletionRequest,
  getAccountDeletionRequests,
  cancelAccountDeletionRequest,
  listAccountDeletionRequests,
  reviewAccountDeletionRequest,
} from "@/modules/identity/account-deletion";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ...overrides },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `account-deletion-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("account deletion requests", () => {
  afterEach(async () => {
    await prisma.accountDeletionRequest.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.store.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("submits a PENDING request", async () => {
    const user = await makeUser();
    const result = await submitAccountDeletionRequest(user.id, "لم أعد أستخدم الموقع");
    expect(result.alreadyPending).toBe(false);
    expect(result.request.status).toBe("PENDING");
    expect(result.request.reason).toBe("لم أعد أستخدم الموقع");
  });

  it("returns the existing PENDING request instead of creating a duplicate", async () => {
    const user = await makeUser();
    const first = await submitAccountDeletionRequest(user.id);
    const second = await submitAccountDeletionRequest(user.id, "سبب مختلف");

    expect(second.alreadyPending).toBe(true);
    expect(second.request.id).toBe(first.request.id);

    const count = await prisma.accountDeletionRequest.count({ where: { userId: user.id } });
    expect(count).toBe(1);
  });

  it("cancels the caller's own PENDING request", async () => {
    const user = await makeUser();
    const created = await submitAccountDeletionRequest(user.id);

    const cancelled = await cancelAccountDeletionRequest(created.request.id, user.id);
    expect(cancelled).toBe(true);

    const remaining = await getAccountDeletionRequests(user.id);
    expect(remaining).toHaveLength(0);
  });

  it("refuses to cancel another user's request", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const created = await submitAccountDeletionRequest(owner.id);

    const cancelled = await cancelAccountDeletionRequest(created.request.id, other.id);
    expect(cancelled).toBe(false);

    const remaining = await getAccountDeletionRequests(owner.id);
    expect(remaining).toHaveLength(1);
  });

  it("listAccountDeletionRequests defaults to PENDING, oldest first", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const first = await submitAccountDeletionRequest(userA.id);
    const second = await submitAccountDeletionRequest(userB.id);

    const queue = await listAccountDeletionRequests({});
    const ids = queue.items.map((item) => item.id);
    expect(ids.indexOf(first.request.id)).toBeLessThan(ids.indexOf(second.request.id));
    expect(queue.items.every((item) => item.status === "PENDING")).toBe(true);
  });

  it("REJECTED leaves the account untouched", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const user = await makeUser();
    const created = await submitAccountDeletionRequest(user.id);

    const result = await reviewAccountDeletionRequest(created.request.id, admin.id, "REJECTED");
    expect(result).toEqual({ success: true });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.deletedAt).toBeNull();

    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: created.request.id } });
    expect(request.status).toBe("REJECTED");
    expect(request.reviewedBy).toBe(admin.id);
  });

  it("APPROVED locks the account, revokes sessions, and soft-deletes listings and store", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const user = await makeUser();
    const category = await makeCategory();
    await createSession(user.id, {});
    await prisma.listing.createMany({
      data: [
        { ownerId: user.id, categoryId: category.id, title: "نشط", status: "ACTIVE" },
        { ownerId: user.id, categoryId: category.id, title: "مباع", status: "SOLD" },
      ],
    });
    await prisma.store.create({ data: { ownerId: user.id, slug: `store-${user.id}`, name: "متجر" } });

    const created = await submitAccountDeletionRequest(user.id);
    const result = await reviewAccountDeletionRequest(created.request.id, admin.id, "APPROVED");
    expect(result).toEqual({ success: true });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.deletedAt).not.toBeNull();

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);

    const listings = await prisma.listing.findMany({ where: { ownerId: user.id } });
    expect(listings).toHaveLength(2);
    expect(listings.every((l) => l.status === "REMOVED" && l.deletedAt !== null)).toBe(true);

    const store = await prisma.store.findUniqueOrThrow({ where: { ownerId: user.id } });
    expect(store.deletedAt).not.toBeNull();
  });

  it("under two concurrent APPROVE calls for the same request, exactly one succeeds and side effects are not duplicated", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const user = await makeUser();
    const category = await makeCategory();
    await createSession(user.id, {});
    await prisma.listing.create({
      data: { ownerId: user.id, categoryId: category.id, title: "نشط", status: "ACTIVE" },
    });
    const created = await submitAccountDeletionRequest(user.id);

    const [resultA, resultB] = await Promise.all([
      reviewAccountDeletionRequest(created.request.id, admin.id, "APPROVED"),
      reviewAccountDeletionRequest(created.request.id, admin.id, "APPROVED"),
    ]);

    const results = [resultA, resultB];
    const wins = results.filter((r) => r.success);
    const losses = results.filter((r) => !r.success);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toEqual({ success: false, error: "already_reviewed" });

    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: created.request.id } });
    expect(request.status).toBe("APPROVED");

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.deletedAt).not.toBeNull();

    const listings = await prisma.listing.findMany({ where: { ownerId: user.id } });
    expect(listings).toHaveLength(1);
    expect(listings[0]?.status).toBe("REMOVED");

    const auditCount = await prisma.auditLog.count({
      where: { action: "admin.account_deletion.approve", targetId: user.id },
    });
    expect(auditCount).toBe(1);

    const notificationCount = await prisma.notification.count({
      where: { userId: user.id, type: "ACCOUNT_DELETION_REVIEWED" },
    });
    expect(notificationCount).toBe(1);
  });

  it("under two concurrent calls where one is REJECT and one is APPROVE, exactly one wins and the account state matches only the winner", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const user = await makeUser();
    const created = await submitAccountDeletionRequest(user.id);

    const [resultA, resultB] = await Promise.all([
      reviewAccountDeletionRequest(created.request.id, admin.id, "APPROVED"),
      reviewAccountDeletionRequest(created.request.id, admin.id, "REJECTED"),
    ]);

    const results = [resultA, resultB];
    const wins = results.filter((r) => r.success);
    expect(wins).toHaveLength(1);

    const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: created.request.id } });
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (request.status === "APPROVED") {
      expect(updatedUser.deletedAt).not.toBeNull();
    } else {
      expect(request.status).toBe("REJECTED");
      expect(updatedUser.deletedAt).toBeNull();
    }
  });

  it("refuses to re-review an already-decided request", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const user = await makeUser();
    const created = await submitAccountDeletionRequest(user.id);
    await reviewAccountDeletionRequest(created.request.id, admin.id, "REJECTED");

    const second = await reviewAccountDeletionRequest(created.request.id, admin.id, "APPROVED");
    expect(second).toEqual({ success: false, error: "already_reviewed" });
  });

  it("refuses to approve deleting the sole remaining ADMIN account", async () => {
    const soleAdmin = await makeUser({ role: "ADMIN" });
    const created = await submitAccountDeletionRequest(soleAdmin.id);

    const result = await reviewAccountDeletionRequest(created.request.id, soleAdmin.id, "APPROVED");
    expect(result).toEqual({ success: false, error: "last_admin" });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: soleAdmin.id } });
    expect(updatedUser.deletedAt).toBeNull();
  });

  it("allows approving deletion of an ADMIN when another ADMIN still remains", async () => {
    const reviewer = await makeUser({ role: "ADMIN" });
    const targetAdmin = await makeUser({ role: "ADMIN" });
    const created = await submitAccountDeletionRequest(targetAdmin.id);

    const result = await reviewAccountDeletionRequest(created.request.id, reviewer.id, "APPROVED");
    expect(result).toEqual({ success: true });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: targetAdmin.id } });
    expect(updatedUser.deletedAt).not.toBeNull();
  });
});
