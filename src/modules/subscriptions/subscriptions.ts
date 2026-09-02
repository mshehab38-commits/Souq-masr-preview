import { prisma } from "@/lib/db";
import type { BillingCycle } from "@prisma/client";
import { getPlatformSettings } from "@/modules/settings/service";
import { recordLedgerEntry } from "@/modules/ledger/service";
import { recordAudit } from "@/lib/audit";

function addBillingPeriod(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start);
  if (cycle === "MONTHLY") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

export type GrantSubscriptionResult =
  | { success: true; subscriptionId: string }
  | { success: false; error: "plan_not_found" | "plan_not_priced" };

// Self-serve online purchase isn't wired yet — that needs a live payment
// gateway (real Paymob credentials, a production-credentials decision, not
// an engineering one). Until then, an admin grants a subscription directly,
// e.g. after an offline/manual payment arrangement. See
// prisma/schema.prisma's Subscription model comment.
export async function grantSubscription(
  adminUserId: string,
  input: { userId: string; planId: string; billingCycle: BillingCycle },
): Promise<GrantSubscriptionResult> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: input.planId, deletedAt: null },
  });
  if (!plan) return { success: false, error: "plan_not_found" };

  const price = input.billingCycle === "MONTHLY" ? plan.monthlyPrice : plan.yearlyPrice;
  if (price === null) return { success: false, error: "plan_not_priced" };

  const startedAt = new Date();
  const subscription = await prisma.subscription.create({
    data: {
      userId: input.userId,
      planId: input.planId,
      billingCycle: input.billingCycle,
      startedAt,
      currentPeriodEnd: addBillingPeriod(startedAt, input.billingCycle),
      grantedBy: adminUserId,
    },
  });

  // Real platform revenue, per the approved business model — even though
  // it was collected offline (no live payment gateway yet), it's recorded
  // here so the ledger stays the single source of truth for all platform
  // revenue, not just the online-payment path.
  await recordLedgerEntry({
    type: "SUBSCRIPTION_REVENUE",
    account: "PLATFORM_REVENUE",
    amount: Number(price),
    subscriptionId: subscription.id,
    description: `Subscription granted: plan ${plan.nameEn} (${input.billingCycle})`,
    metadata: { grantedBy: adminUserId, collectedOffline: true },
  });

  return { success: true, subscriptionId: subscription.id };
}

// Self-audits with the subscription's userId/planId — this action
// previously recorded zero metadata at all, not just thin metadata (see
// docs/DECISIONS.md).
export async function revokeSubscription(subscriptionId: string, actorId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, status: "ACTIVE" },
  });
  if (!subscription) return false;

  const result = await prisma.subscription.updateMany({
    where: { id: subscriptionId, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (result.count === 0) return false;

  await recordAudit({
    actorId,
    action: "subscription.revoke",
    targetType: "Subscription",
    targetId: subscriptionId,
    metadata: { userId: subscription.userId, planId: subscription.planId },
  });

  return true;
}

export async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
    include: { plan: true },
    orderBy: { currentPeriodEnd: "desc" },
  });
}

export async function listUserSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

// The single source of truth for "how many ACTIVE listings can this user
// have right now": their subscription plan's limit if they have an active
// subscription with one set, otherwise the platform-wide free-tier default.
// Returns null for "no limit" — either because the plan grants unlimited
// listings, or because the owner hasn't configured a free-tier cap yet
// (fails OPEN, never an invented number; see PlatformSettings).
export async function resolveActiveListingLimit(userId: string): Promise<number | null> {
  const subscription = await getActiveSubscription(userId);
  if (subscription) {
    return subscription.plan.activeListingLimit;
  }

  const settings = await getPlatformSettings();
  return settings.freeListingActiveLimit;
}
