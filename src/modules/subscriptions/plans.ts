import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/lib/audit";

export interface SubscriptionPlanInput {
  slug: string;
  nameAr: string;
  nameEn: string;
  monthlyPrice?: number | null;
  yearlyPrice?: number | null;
  activeListingLimit?: number | null;
  imageLimitPerListing?: number | null;
  allowPromotedListings?: boolean;
  priorityPlacement?: boolean;
  geographicTargeting?: unknown;
  storeFeatures?: unknown;
  sortOrder?: number;
  isActive?: boolean;
}

export async function listPlans(includeInactive = false) {
  return prisma.subscriptionPlan.findMany({
    where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getPlanById(id: string) {
  return prisma.subscriptionPlan.findFirst({ where: { id, deletedAt: null } });
}

export async function createPlan(input: SubscriptionPlanInput) {
  return prisma.subscriptionPlan.create({
    data: {
      slug: input.slug,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      monthlyPrice: input.monthlyPrice,
      yearlyPrice: input.yearlyPrice,
      activeListingLimit: input.activeListingLimit,
      imageLimitPerListing: input.imageLimitPerListing,
      allowPromotedListings: input.allowPromotedListings ?? false,
      priorityPlacement: input.priorityPlacement ?? false,
      geographicTargeting: input.geographicTargeting as Prisma.InputJsonValue | undefined,
      storeFeatures: input.storeFeatures as Prisma.InputJsonValue | undefined,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
}

export type UpdatePlanResult = { success: true } | { success: false; error: "not_found" };

// Self-audits with the prior values for every key present in `input` —
// see settings.ts's updatePlatformSettings for the same pattern and
// docs/DECISIONS.md for why.
export async function updatePlan(
  id: string,
  actorId: string,
  input: Partial<SubscriptionPlanInput>,
): Promise<UpdatePlanResult> {
  const before = await prisma.subscriptionPlan.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { success: false, error: "not_found" };

  const result = await prisma.subscriptionPlan.updateMany({
    where: { id, deletedAt: null },
    data: {
      ...input,
      geographicTargeting: input.geographicTargeting as Prisma.InputJsonValue | undefined,
      storeFeatures: input.storeFeatures as Prisma.InputJsonValue | undefined,
    },
  });
  if (result.count === 0) return { success: false, error: "not_found" };

  // monthlyPrice/yearlyPrice are Prisma Decimals — convert to plain
  // numbers before storing in JSON metadata, same as rates.ts/commission.ts
  // do for their own Decimal fields (a raw Decimal only round-trips through
  // JSON via its own toString(), which would silently store a string here
  // instead of a number).
  const from = Object.fromEntries(
    Object.keys(input).map((key) => {
      const value = before[key as keyof typeof before];
      return [key, value instanceof Prisma.Decimal ? value.toNumber() : value];
    }),
  );
  await recordAudit({
    actorId,
    action: "subscription_plan.update",
    targetType: "SubscriptionPlan",
    targetId: id,
    metadata: { from, to: input },
  });

  return { success: true };
}

export async function softDeletePlan(id: string): Promise<boolean> {
  const result = await prisma.subscriptionPlan.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  return result.count > 0;
}
