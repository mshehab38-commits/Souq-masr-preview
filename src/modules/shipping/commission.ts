import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

// Null = OWNER CONFIGURATION REQUIRED — the platform earns 0% on this
// company's shipments until a real contracted percentage is set. Never an
// invented number. See prisma/schema.prisma's ShippingCommissionRule.
export async function getCommissionRule(shippingCompanyId: string) {
  return prisma.shippingCommissionRule.findUnique({ where: { shippingCompanyId } });
}

// Self-audits with the prior commissionPercent (null if this is the
// first rule for this company) — see settings.ts's
// updatePlatformSettings for the same pattern and docs/DECISIONS.md for
// why.
export async function setCommissionRule(shippingCompanyId: string, actorId: string, commissionPercent: number | null) {
  const before = await getCommissionRule(shippingCompanyId);

  const rule = await prisma.shippingCommissionRule.upsert({
    where: { shippingCompanyId },
    update: { commissionPercent },
    create: { shippingCompanyId, commissionPercent },
  });

  await recordAudit({
    actorId,
    action: "shipping_commission_rule.update",
    targetType: "ShippingCommissionRule",
    targetId: rule.id,
    metadata: {
      from: before ? (before.commissionPercent === null ? null : Number(before.commissionPercent)) : null,
      to: { commissionPercent },
    },
  });

  return rule;
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
