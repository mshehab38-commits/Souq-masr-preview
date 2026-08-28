import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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

export async function updatePlan(
  id: string,
  input: Partial<SubscriptionPlanInput>,
): Promise<UpdatePlanResult> {
  const result = await prisma.subscriptionPlan.updateMany({
    where: { id, deletedAt: null },
    data: {
      ...input,
      geographicTargeting: input.geographicTargeting as Prisma.InputJsonValue | undefined,
      storeFeatures: input.storeFeatures as Prisma.InputJsonValue | undefined,
    },
  });
  if (result.count === 0) return { success: false, error: "not_found" };
  return { success: true };
}

export async function softDeletePlan(id: string): Promise<boolean> {
  const result = await prisma.subscriptionPlan.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  return result.count > 0;
}
