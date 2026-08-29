import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordLedgerEntry, listLedgerEntries, getLedgerSummary } from "@/modules/ledger/ledger";

const createdEntryIds: string[] = [];

describe("recordLedgerEntry", () => {
  afterEach(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    createdEntryIds.length = 0;
  });

  it("records a ledger entry with the exact type/account/amount the caller specifies", async () => {
    const entry = await recordLedgerEntry({
      type: "SUBSCRIPTION_REVENUE",
      account: "PLATFORM_REVENUE",
      amount: 123.45,
      description: "test entry",
    });
    createdEntryIds.push(entry.id);

    const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.type).toBe("SUBSCRIPTION_REVENUE");
    expect(row.account).toBe("PLATFORM_REVENUE");
    expect(Number(row.amount)).toBe(123.45);
    expect(row.currency).toBe("EGP");
  });

  it("defaults currency to EGP but allows overriding it", async () => {
    const entry = await recordLedgerEntry({
      type: "REFUND_ISSUED",
      account: "BUYER_REFUNDABLE",
      amount: 10,
      currency: "USD",
    });
    createdEntryIds.push(entry.id);

    const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.currency).toBe("USD");
  });

  it("never requires an order/subscription/settlement link — all are optional", async () => {
    const entry = await recordLedgerEntry({
      type: "PROMOTED_LISTING_REVENUE",
      account: "PLATFORM_REVENUE",
      amount: 50,
    });
    createdEntryIds.push(entry.id);

    expect(entry.orderId).toBeNull();
    expect(entry.subscriptionId).toBeNull();
    expect(entry.shippingSettlementId).toBeNull();
  });
});

describe("listLedgerEntries", () => {
  afterEach(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    createdEntryIds.length = 0;
  });

  it("filters by type and account", async () => {
    const entry = await recordLedgerEntry({
      type: "SELLER_PAYOUT",
      account: "SELLER_PAYABLE",
      amount: 200,
    });
    createdEntryIds.push(entry.id);

    const results = await listLedgerEntries({ type: "SELLER_PAYOUT", account: "SELLER_PAYABLE" });
    expect(results.some((r) => r.id === entry.id)).toBe(true);
  });

  it("respects the limit parameter", async () => {
    const results = await listLedgerEntries({}, 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe("getLedgerSummary", () => {
  afterEach(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    createdEntryIds.length = 0;
  });

  it("aggregates PLATFORM_REVENUE entries by type, and the delta reflects newly recorded revenue", async () => {
    // PROMOTED_LISTING_REVENUE isn't written by any other module yet (only
    // subscriptions/shipping-settlement write their own types), so the
    // before/after delta for this specific type is safe from interference
    // by other test files running concurrently against the same database.
    const before = await getLedgerSummary();
    const beforeAmount = before.platformRevenueByType.PROMOTED_LISTING_REVENUE ?? 0;

    const entry = await recordLedgerEntry({
      type: "PROMOTED_LISTING_REVENUE",
      account: "PLATFORM_REVENUE",
      amount: 77,
    });
    createdEntryIds.push(entry.id);

    const after = await getLedgerSummary();
    expect(after.platformRevenueByType.PROMOTED_LISTING_REVENUE).toBe(beforeAmount + 77);
    expect(after.totalPlatformRevenue).toBeGreaterThanOrEqual(before.totalPlatformRevenue + 77);
  });

  it("never counts a SELLER_PAYABLE entry as platform revenue — this is the zero-commission guarantee", async () => {
    const before = await getLedgerSummary();

    const entry = await recordLedgerEntry({
      type: "SELLER_PAYOUT",
      account: "SELLER_PAYABLE",
      amount: 5000,
    });
    createdEntryIds.push(entry.id);

    const after = await getLedgerSummary();
    expect(after.totalPlatformRevenue).toBe(before.totalPlatformRevenue);
  });
});
