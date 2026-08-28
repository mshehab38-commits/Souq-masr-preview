import { prisma } from "@/lib/db";
import { recordLedgerEntry } from "@/modules/ledger/service";

// Sums the shipping fees and commission (both already snapshotted per-order
// at checkout time — see Order.shippingFee/shippingCommissionAmount) for a
// company's COMPLETED orders in a period, and records a settlement row.
// Kept entirely separate from seller payouts: this money never touches a
// seller's balance.
export async function computeSettlementForPeriod(
  shippingCompanyId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  const orders = await prisma.order.findMany({
    where: {
      shippingCompanyId,
      status: "COMPLETED",
      completedAt: { gte: periodStart, lt: periodEnd },
    },
    select: { shippingFee: true, shippingCommissionAmount: true },
  });

  const totalShippingFees = orders.reduce((sum, order) => sum + Number(order.shippingFee ?? 0), 0);
  const totalCommission = orders.reduce(
    (sum, order) => sum + Number(order.shippingCommissionAmount ?? 0),
    0,
  );

  const settlement = await prisma.shippingSettlement.create({
    data: {
      shippingCompanyId,
      periodStart,
      periodEnd,
      totalShippingFees,
      totalCommission,
    },
  });

  // Owed BY the shipping company, regardless of how the buyer paid for the
  // order (cash-on-delivery or a future online method) — the platform
  // never has to have held the shipping fee itself to be owed this cut.
  if (totalCommission > 0) {
    await recordLedgerEntry({
      type: "SHIPPING_COMMISSION_REVENUE",
      account: "PLATFORM_REVENUE",
      amount: totalCommission,
      shippingSettlementId: settlement.id,
      description: `Shipping commission for ${shippingCompanyId}, ${periodStart.toISOString()}–${periodEnd.toISOString()}`,
    });
  }

  return settlement;
}

export async function listSettlements(shippingCompanyId?: string) {
  return prisma.shippingSettlement.findMany({
    where: shippingCompanyId ? { shippingCompanyId } : undefined,
    include: { shippingCompany: true },
    orderBy: { periodStart: "desc" },
  });
}

export type UpdateSettlementStatusResult = { success: true } | { success: false; error: "not_found" };

export async function updateSettlementStatus(
  id: string,
  status: "PENDING" | "INVOICED" | "PAID",
  invoiceReference?: string,
): Promise<UpdateSettlementStatusResult> {
  const result = await prisma.shippingSettlement.updateMany({
    where: { id },
    data: { status, invoiceReference },
  });
  if (result.count === 0) return { success: false, error: "not_found" };
  return { success: true };
}
