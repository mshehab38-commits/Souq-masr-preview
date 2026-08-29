import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { createReport, listReports, resolveReport } from "@/modules/moderation/reports";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const rateKeysToClean: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `mod-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeListing(ownerId: string, categoryId: string) {
  return prisma.listing.create({
    data: { ownerId, categoryId, title: "إعلان للاختبار", status: "ACTIVE" },
  });
}

async function cleanup() {
  await prisma.report.deleteMany({ where: { reporterId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  if (rateKeysToClean.length > 0) {
    await redis.del(...rateKeysToClean);
    rateKeysToClean.length = 0;
  }
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("createReport", () => {
  afterEach(cleanup);

  it("rate-limits a reporter after 20 reports within the window, across different targets", async () => {
    const reporter = await makeUser();
    rateKeysToClean.push(`reports:rate:${reporter.id}`);
    const targets = await Promise.all(Array.from({ length: 20 }, () => makeUser()));

    for (const target of targets) {
      const result = await createReport(reporter.id, {
        targetType: "USER",
        targetUserId: target.id,
        reason: "OTHER",
      });
      expect(result.success).toBe(true);
    }

    const oneTooMany = await makeUser();
    const blocked = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: oneTooMany.id,
      reason: "OTHER",
    });
    expect(blocked).toEqual({ success: false, error: "rate_limited" });
  });

  it("does not count a deduped (alreadyOpen) report against the rate limit", async () => {
    const reporter = await makeUser();
    rateKeysToClean.push(`reports:rate:${reporter.id}`);
    const target = await makeUser();

    await createReport(reporter.id, { targetType: "USER", targetUserId: target.id, reason: "OTHER" });
    const deduped = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: target.id,
      reason: "OTHER",
    });
    expect(deduped).toMatchObject({ success: true, alreadyOpen: true });

    const count = await redis.get(`reports:rate:${reporter.id}`);
    expect(Number(count)).toBe(1);
  });

  it("creates a report against a listing", async () => {
    const reporter = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const result = await createReport(reporter.id, {
      targetType: "LISTING",
      listingId: listing.id,
      reason: "SPAM",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.alreadyOpen).toBe(false);
    expect(result.report?.status).toBe("OPEN");
  });

  it("creates a report against a user", async () => {
    const reporter = await makeUser();
    const target = await makeUser();

    const result = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: target.id,
      reason: "FRAUD_SCAM",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.report?.targetUserId).toBe(target.id);
  });

  it("returns the existing OPEN report instead of creating a duplicate", async () => {
    const reporter = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const first = await createReport(reporter.id, {
      targetType: "LISTING",
      listingId: listing.id,
      reason: "SPAM",
    });
    const second = await createReport(reporter.id, {
      targetType: "LISTING",
      listingId: listing.id,
      reason: "DUPLICATE",
    });

    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.alreadyOpen).toBe(true);
    expect(second.report?.id).toBe(first.report?.id);

    const count = await prisma.report.count({ where: { listingId: listing.id } });
    expect(count).toBe(1);
  });

  it("rejects reporting a nonexistent listing", async () => {
    const reporter = await makeUser();
    const result = await createReport(reporter.id, {
      targetType: "LISTING",
      listingId: "does-not-exist",
      reason: "SPAM",
    });
    expect(result).toEqual({ success: false, error: "target_not_found" });
  });

  it("rejects a user reporting themselves", async () => {
    const reporter = await makeUser();
    const result = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: reporter.id,
      reason: "OTHER",
    });
    expect(result).toEqual({ success: false, error: "cannot_report_self" });
  });
});

describe("listReports", () => {
  afterEach(cleanup);

  it("defaults to OPEN reports and supports filtering by targetType", async () => {
    const reporter = await makeUser();
    const target = await makeUser();

    await createReport(reporter.id, { targetType: "USER", targetUserId: target.id, reason: "OTHER" });

    const openResults = await listReports({});
    expect(openResults.items.some((r) => r.reporterId === reporter.id)).toBe(true);

    const userOnly = await listReports({ targetType: "USER" });
    expect(userOnly.items.every((r) => r.targetType === "USER")).toBe(true);
  });
});

describe("resolveReport", () => {
  afterEach(cleanup);

  it("dismisses a report without taking any action", async () => {
    const reporter = await makeUser();
    const target = await makeUser();
    const moderator = await makeUser();
    const created = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: target.id,
      reason: "OTHER",
    });
    if (!created.success || !created.report) throw new Error("setup failed");

    const result = await resolveReport(created.report.id, moderator.id, { decision: "DISMISS" });
    expect(result).toEqual({ success: true });

    const updated = await prisma.report.findUniqueOrThrow({ where: { id: created.report.id } });
    expect(updated.status).toBe("DISMISSED");
    expect(updated.reviewedById).toBe(moderator.id);
  });

  it("resolves with REMOVE_LISTING and actually removes the listing", async () => {
    const reporter = await makeUser();
    const seller = await makeUser();
    const moderator = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const created = await createReport(reporter.id, {
      targetType: "LISTING",
      listingId: listing.id,
      reason: "PROHIBITED_ITEM",
    });
    if (!created.success || !created.report) throw new Error("setup failed");

    const result = await resolveReport(created.report.id, moderator.id, {
      decision: "ACTION_TAKEN",
      action: "REMOVE_LISTING",
    });
    expect(result).toEqual({ success: true });

    const updatedListing = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updatedListing.status).toBe("REMOVED");
    expect(updatedListing.deletedAt).not.toBeNull();

    const updatedReport = await prisma.report.findUniqueOrThrow({ where: { id: created.report.id } });
    expect(updatedReport.status).toBe("ACTION_TAKEN");
  });

  it("resolves with SUSPEND_USER and revokes the target's active sessions", async () => {
    const reporter = await makeUser();
    const target = await makeUser();
    const moderator = await makeUser();
    await prisma.session.create({
      data: { userId: target.id, tokenHash: `hash-${Math.random()}`, expiresAt: new Date(Date.now() + 100_000) },
    });

    const created = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: target.id,
      reason: "FRAUD_SCAM",
    });
    if (!created.success || !created.report) throw new Error("setup failed");

    const result = await resolveReport(created.report.id, moderator.id, {
      decision: "ACTION_TAKEN",
      action: "SUSPEND_USER",
    });
    expect(result).toEqual({ success: true });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updatedUser.status).toBe("SUSPENDED");

    const activeSessions = await prisma.session.count({ where: { userId: target.id, revokedAt: null } });
    expect(activeSessions).toBe(0);
  });

  it("refuses to resolve a report that's already been resolved", async () => {
    const reporter = await makeUser();
    const target = await makeUser();
    const moderator = await makeUser();
    const created = await createReport(reporter.id, {
      targetType: "USER",
      targetUserId: target.id,
      reason: "OTHER",
    });
    if (!created.success || !created.report) throw new Error("setup failed");

    await resolveReport(created.report.id, moderator.id, { decision: "DISMISS" });
    const secondAttempt = await resolveReport(created.report.id, moderator.id, { decision: "DISMISS" });
    expect(secondAttempt).toEqual({ success: false, error: "already_resolved" });
  });

  it("returns not_found for a nonexistent report", async () => {
    const moderator = await makeUser();
    const result = await resolveReport("does-not-exist", moderator.id, { decision: "DISMISS" });
    expect(result).toEqual({ success: false, error: "not_found" });
  });
});
