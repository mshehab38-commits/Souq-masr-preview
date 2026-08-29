import { prisma } from "@/lib/db";

// Null = OWNER CONFIGURATION REQUIRED — the platform earns 0% on this
// company's shipments until a real contracted percentage is set. Never an
// invented number. See prisma/schema.prisma's ShippingCommissionRule.
export async function getCommissionRule(shippingCompanyId: string) {
  return prisma.shippingCommissionRule.findUnique({ where: { shippingCompanyId } });
}

export async function setCommissionRule(shippingCompanyId: string, commissionPercent: number | null) {
  return prisma.shippingCommissionRule.upsert({
    where: { shippingCompanyId },
    update: { commissionPercent },
    create: { shippingCompanyId, commissionPercent },
  });
}

// Platform revenue owed BY the shipping company on a given shipping fee —
// 0 whenever no rule is configured yet, never a guessed percentage.
export async function computeShippingCommission(
  shippingCompanyId: string,
  shippingFee: number,
): Promise<number> {
  const rule = await getCommissionRule(shippingCompanyId);
  if (!rule?.isActive || rule.commissionPercent === null) return 0;
  return Number(((shippingFee * Number(rule.commissionPercent)) / 100).toFixed(2));
}
