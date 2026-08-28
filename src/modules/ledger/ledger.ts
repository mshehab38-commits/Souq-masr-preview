import { prisma } from "@/lib/db";
import type { LedgerAccount, LedgerEntryType, Prisma } from "@prisma/client";

export interface RecordLedgerEntryInput {
  type: LedgerEntryType;
  account: LedgerAccount;
  amount: number;
  currency?: string;
  orderId?: string;
  subscriptionId?: string;
  shippingSettlementId?: string;
  description?: string;
  metadata?: unknown;
}

// The single write path for every financial audit-trail row. Callers pick
// `account` explicitly rather than the ledger inferring it, so a caller
// bug (e.g. tagging an order's product price as PLATFORM_REVENUE) is
// visible at the call site during review, not hidden behind "smart"
// inference logic here. See prisma/schema.prisma's LedgerAccount comment
// for why PLATFORM_REVENUE must never be used for product-sale proceeds.
export async function recordLedgerEntry(input: RecordLedgerEntryInput) {
  return prisma.ledgerEntry.create({
    data: {
      type: input.type,
      account: input.account,
      amount: input.amount,
      currency: input.currency ?? "EGP",
      orderId: input.orderId,
      subscriptionId: input.subscriptionId,
      shippingSettlementId: input.shippingSettlementId,
      description: input.description,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export interface LedgerFilter {
  type?: LedgerEntryType;
  account?: LedgerAccount;
  orderId?: string;
}

export async function listLedgerEntries(filter: LedgerFilter = {}, limit = 100) {
  return prisma.ledgerEntry.findMany({
    where: { type: filter.type, account: filter.account, orderId: filter.orderId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export interface LedgerSummary {
  platformRevenueByType: Partial<Record<LedgerEntryType, number>>;
  totalPlatformRevenue: number;
}

// A first, minimal financial reporting view: total platform revenue,
// broken down by source (subscriptions / promoted listings / shipping
// commission) — never including a single EGP of order product-sale value,
// per the approved zero-commission business model.
export async function getLedgerSummary(): Promise<LedgerSummary> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["type"],
    where: { account: "PLATFORM_REVENUE" },
    _sum: { amount: true },
  });

  const platformRevenueByType: Partial<Record<LedgerEntryType, number>> = {};
  let totalPlatformRevenue = 0;
  for (const row of rows) {
    const amount = Number(row._sum.amount ?? 0);
    platformRevenueByType[row.type] = amount;
    totalPlatformRevenue += amount;
  }

  return { platformRevenueByType, totalPlatformRevenue };
}
