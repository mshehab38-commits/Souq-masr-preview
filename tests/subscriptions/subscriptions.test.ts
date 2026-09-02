import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createPlan,
  updatePlan,
  softDeletePlan,
  listPlans,
} from "@/modules/subscriptions/plans";
import {
  grantSubscription,
  revokeSubscription,
  getActiveSubscription,
  resolveActiveListingLimit,
} from "@/modules/subscriptions/subscriptions";
import { updatePlatformSettings } from "@/modules/settings/settings";

const createdUserIds: string[] = [];
const createdPlanIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makePlan(overrides: Partial<Parameters<typeof createPlan>[0]> = {}) {
  const plan = await createPlan({
    slug: `plan-${Math.random().toString(36).slice(2)}`,
    nameAr: "خطة اختبارية",
    nameEn: "Test Plan",
    ...overrides,
  });
  createdPlanIds.push(plan.id);
  return plan;
}

describe("subscription plans", () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { subscription: { userId: { in: createdUserIds } } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdPlanIds.length = 0;
  });

  it("creates a plan with both prices null by default — never an invented figure", async () => {
    const plan = await makePlan();
    expect(plan.monthlyPrice).toBeNull();
    expect(plan.yearlyPrice).toBeNull();
    expect(plan.isActive).toBe(true);
  });

  it("lists only active plans by default, and all plans when includeInactive is true", async () => {
    const active = await makePlan();
    const inactive = await makePlan({ isActive: false });

    const defaultList = await listPlans();
    expect(defaultList.some((p) => p.id === active.id)).toBe(true);
    expect(defaultList.some((p) => p.id === inactive.id)).toBe(false);

    const fullList = await listPlans(true);
    expect(fullList.some((p) => p.id === inactive.id)).toBe(true);
  });

  it("updates a plan's price and limit", async () => {
    const admin = await makeUser();
    const plan = await makePlan();
    const result = await updatePlan(plan.id, admin.id, { monthlyPrice: 100, activeListingLimit: 20 });
    expect(result).toEqual({ success: true });

    const updated = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(Number(updated.monthlyPrice)).toBe(100);
    expect(updated.activeListingLimit).toBe(20);
  });

  it("reports not_found when updating a plan that doesn't exist", async () => {
    const admin = await makeUser();
    const result = await updatePlan("does-not-exist", admin.id, { monthlyPrice: 50 });
    expect(result).toEqual({ success: false, error: "not_found" });
  });

  it("self-audits with the prior values for only the changed keys", async () => {
    const admin = await makeUser();
    const plan = await makePlan({ monthlyPrice: 100 });

    await updatePlan(plan.id, admin.id, { monthlyPrice: 150 });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "subscription_plan.update", targetId: plan.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log.metadata).toEqual({ from: { monthlyPrice: 100 }, to: { monthlyPrice: 150 } });
  });

  it("soft-deletes a plan and deactivates it", async () => {
    const plan = await makePlan();
    const deleted = await softDeletePlan(plan.id);
    expect(deleted).toBe(true);

    const row = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.isActive).toBe(false);
  });
});

describe("grantSubscription", () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { subscription: { userId: { in: createdUserIds } } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdPlanIds.length = 0;
  });

  it("refuses to grant a plan with no price set for the requested billing cycle", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan();

    const result = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
    });
    expect(result).toEqual({ success: false, error: "plan_not_priced" });
  });

  it("refuses to grant a plan that doesn't exist", async () => {
    const admin = await makeUser();
    const user = await makeUser();

    const result = await grantSubscription(admin.id, {
      userId: user.id,
      planId: "does-not-exist",
      billingCycle: "MONTHLY",
    });
    expect(result).toEqual({ success: false, error: "plan_not_found" });
  });

  it("grants a priced plan, activates it, and records platform revenue in the ledger", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan({ monthlyPrice: 150 });

    const result = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: result.subscriptionId },
    });
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.grantedBy).toBe(admin.id);
    expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { subscriptionId: result.subscriptionId },
    });
    expect(ledgerEntry.type).toBe("SUBSCRIPTION_REVENUE");
    expect(ledgerEntry.account).toBe("PLATFORM_REVENUE");
    expect(Number(ledgerEntry.amount)).toBe(150);
  });

  it("sets a yearly period end roughly a year out for YEARLY billing", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan({ yearlyPrice: 1000 });

    const result = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "YEARLY",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: result.subscriptionId },
    });
    const daysUntilExpiry =
      (subscription.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(300);
  });

  it("revokes an active subscription", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan({ monthlyPrice: 100 });

    const granted = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
    });
    expect(granted.success).toBe(true);
    if (!granted.success) return;

    const revoked = await revokeSubscription(granted.subscriptionId, admin.id);
    expect(revoked).toBe(true);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: granted.subscriptionId },
    });
    expect(subscription.status).toBe("CANCELLED");
    expect(subscription.cancelledAt).not.toBeNull();
  });

  it("self-audits a revoke with the subscription's userId/planId — previously recorded no metadata at all", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan({ monthlyPrice: 100 });

    const granted = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
    });
    expect(granted.success).toBe(true);
    if (!granted.success) return;

    await revokeSubscription(granted.subscriptionId, admin.id);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "subscription.revoke", targetId: granted.subscriptionId },
      orderBy: { createdAt: "desc" },
    });
    expect(log.metadata).toEqual({ userId: user.id, planId: plan.id });
  });

  it("returns false and records no audit entry when revoking an already-inactive subscription", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan({ monthlyPrice: 100 });

    const granted = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
    });
    expect(granted.success).toBe(true);
    if (!granted.success) return;

    await revokeSubscription(granted.subscriptionId, admin.id);
    const secondAttempt = await revokeSubscription(granted.subscriptionId, admin.id);
    expect(secondAttempt).toBe(false);

    const logCount = await prisma.auditLog.count({
      where: { action: "subscription.revoke", targetId: granted.subscriptionId },
    });
    expect(logCount).toBe(1);
  });

  it("getActiveSubscription returns null once a subscription is revoked", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    const plan = await makePlan({ monthlyPrice: 100 });

    const granted = await grantSubscription(admin.id, {
      userId: user.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
    });
    expect(granted.success).toBe(true);
    if (!granted.success) return;

    expect(await getActiveSubscription(user.id)).not.toBeNull();
    await revokeSubscription(granted.subscriptionId, admin.id);
    expect(await getActiveSubscription(user.id)).toBeNull();
  });
});

describe("resolveActiveListingLimit", () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { subscription: { userId: { in: createdUserIds } } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.platformSettings.updateMany({
      where: { id: "singleton" },
      data: { freeListingActiveLimit: null },
    });
    createdUserIds.length = 0;
    createdPlanIds.length = 0;
  });

  it("falls back to the platform free-tier limit when the user has no active subscription", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 3 });

    expect(await resolveActiveListingLimit(user.id)).toBe(3);
  });

  it("returns null (unlimited) when neither a subscription nor a platform limit is configured", async () => {
    const user = await makeUser();
    expect(await resolveActiveListingLimit(user.id)).toBeNull();
  });

  it("an active subscription's plan limit overrides the platform free-tier limit", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 1 });
    const plan = await makePlan({ monthlyPrice: 100, activeListingLimit: 50 });

    await grantSubscription(admin.id, { userId: user.id, planId: plan.id, billingCycle: "MONTHLY" });

    expect(await resolveActiveListingLimit(user.id)).toBe(50);
  });

  it("a subscribed plan with no listing limit set means unlimited, even if the platform default is set", async () => {
    const admin = await makeUser();
    const user = await makeUser();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 1 });
    const plan = await makePlan({ monthlyPrice: 100 });

    await grantSubscription(admin.id, { userId: user.id, planId: plan.id, billingCycle: "MONTHLY" });

    expect(await resolveActiveListingLimit(user.id)).toBeNull();
  });
});
