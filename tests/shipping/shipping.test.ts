import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createShippingCompany,
  updateShippingCompany,
  softDeleteShippingCompany,
  type ShippingCompanyInput,
} from "@/modules/shipping/companies";
import { upsertShippingRate, setDefaultFlatFee, resolveShippingFee, listAvailableShippingOptions } from "@/modules/shipping/rates";
import { setCommissionRule, computeShippingCommission } from "@/modules/shipping/commission";
import { computeSettlementForPeriod, updateSettlementStatus } from "@/modules/shipping/settlements";

const createdCompanyIds: string[] = [];
const createdGovernorateIds: string[] = [];
const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeCompany(overrides: Partial<ShippingCompanyInput> = {}) {
  const company = await createShippingCompany({
    slug: `company-${Math.random().toString(36).slice(2)}`,
    name: "شركة شحن اختبارية",
    ...overrides,
  });
  createdCompanyIds.push(company.id);
  return company;
}

async function makeAdmin() {
  const user = await prisma.user.create({
    data: {
      phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      role: "ADMIN",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeGovernorate() {
  const governorate = await prisma.governorate.create({
    data: {
      slug: `gov-${Math.random().toString(36).slice(2)}`,
      nameAr: "محافظة اختبارية",
      nameEn: "Test Governorate",
    },
  });
  createdGovernorateIds.push(governorate.id);
  return governorate;
}

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.ledgerEntry.deleteMany({
    where: { shippingSettlement: { shippingCompanyId: { in: createdCompanyIds } } },
  });
  await prisma.shippingSettlement.deleteMany({ where: { shippingCompanyId: { in: createdCompanyIds } } });
  await prisma.order.deleteMany({ where: { shippingCompanyId: { in: createdCompanyIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.shippingCommissionRule.deleteMany({ where: { shippingCompanyId: { in: createdCompanyIds } } });
  await prisma.shippingRate.deleteMany({ where: { shippingCompanyId: { in: createdCompanyIds } } });
  await prisma.shippingCompany.deleteMany({ where: { id: { in: createdCompanyIds } } });
  await prisma.governorate.deleteMany({ where: { id: { in: createdGovernorateIds } } });
  createdCompanyIds.length = 0;
  createdGovernorateIds.length = 0;
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("shipping companies", () => {
  afterEach(cleanup);

  it("creates a company with no default fee configured (no invented pricing)", async () => {
    const company = await makeCompany();
    expect(company.defaultFlatFee).toBeNull();
    expect(company.isActive).toBe(true);
  });

  it("soft-deletes a company and deactivates it", async () => {
    const company = await makeCompany();
    const deleted = await softDeleteShippingCompany(company.id);
    expect(deleted).toBe(true);

    const row = await prisma.shippingCompany.findUniqueOrThrow({ where: { id: company.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.isActive).toBe(false);
  });
});

describe("resolveShippingFee", () => {
  afterEach(cleanup);

  it("returns null when neither a governorate-specific rate nor a default fee is configured", async () => {
    const company = await makeCompany();
    const governorate = await makeGovernorate();
    expect(await resolveShippingFee(company.id, governorate.id)).toBeNull();
  });

  it("falls back to the company default fee when no governorate-specific rate exists", async () => {
    const company = await makeCompany();
    const governorate = await makeGovernorate();
    await setDefaultFlatFee(company.id, 50);

    expect(await resolveShippingFee(company.id, governorate.id)).toBe(50);
  });

  it("prefers a governorate-specific rate over the company default", async () => {
    const admin = await makeAdmin();
    const company = await makeCompany();
    const governorate = await makeGovernorate();
    await setDefaultFlatFee(company.id, 50);
    await upsertShippingRate(company.id, admin.id, governorate.id, 75);

    expect(await resolveShippingFee(company.id, governorate.id)).toBe(75);
  });

  it("returns null for a null governorateId with no default fee set", async () => {
    const company = await makeCompany();
    expect(await resolveShippingFee(company.id, null)).toBeNull();
  });

  it("listAvailableShippingOptions only includes active companies with a resolvable fee", async () => {
    const admin = await makeAdmin();
    const governorate = await makeGovernorate();
    const withRate = await makeCompany();
    await upsertShippingRate(withRate.id, admin.id, governorate.id, 40);
    const withoutRate = await makeCompany();
    const inactiveWithRate = await makeCompany({ isActive: false });
    await upsertShippingRate(inactiveWithRate.id, admin.id, governorate.id, 30);

    const options = await listAvailableShippingOptions(governorate.id);
    const companyIds = options.map((o) => o.companyId);

    expect(companyIds).toContain(withRate.id);
    expect(companyIds).not.toContain(withoutRate.id);
    expect(companyIds).not.toContain(inactiveWithRate.id);
  });
});

describe("shipping commission", () => {
  afterEach(cleanup);

  it("computes zero commission when no rule is configured (never a guessed percentage)", async () => {
    const company = await makeCompany();
    expect(await computeShippingCommission(company.id, 100)).toBe(0);
  });

  it("computes zero commission when a rule exists but is inactive", async () => {
    const admin = await makeAdmin();
    const company = await makeCompany();
    await setCommissionRule(company.id, admin.id, 10);
    await prisma.shippingCommissionRule.update({
      where: { shippingCompanyId: company.id },
      data: { isActive: false },
    });
    expect(await computeShippingCommission(company.id, 100)).toBe(0);
  });

  it("computes the correct commission amount once a percentage is set", async () => {
    const admin = await makeAdmin();
    const company = await makeCompany();
    await setCommissionRule(company.id, admin.id, 10);
    expect(await computeShippingCommission(company.id, 200)).toBe(20);
  });
});

describe("audit metadata for shipping mutations", () => {
  afterEach(cleanup);

  it("updateShippingCompany self-audits with prior values for only the changed keys", async () => {
    const admin = await makeAdmin();
    const company = await makeCompany({ isActive: true });

    await updateShippingCompany(company.id, admin.id, { isActive: false });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "shipping_company.update", targetId: company.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log.metadata).toEqual({ from: { isActive: true }, to: { isActive: false } });
  });

  it("upsertShippingRate self-audits with null from on first insert, then the prior fee on overwrite", async () => {
    const admin = await makeAdmin();
    const company = await makeCompany();
    const governorate = await makeGovernorate();

    const first = await upsertShippingRate(company.id, admin.id, governorate.id, 50);
    const firstLog = await prisma.auditLog.findFirstOrThrow({
      where: { action: "shipping_rate.upsert", targetId: first.id },
      orderBy: { createdAt: "desc" },
    });
    expect(firstLog.metadata).toEqual({ from: null, to: { governorateId: governorate.id, flatFee: 50 } });

    const second = await upsertShippingRate(company.id, admin.id, governorate.id, 75);
    const secondLog = await prisma.auditLog.findFirstOrThrow({
      where: { action: "shipping_rate.upsert", targetId: second.id },
      orderBy: { createdAt: "desc" },
    });
    expect(secondLog.metadata).toEqual({ from: 50, to: { governorateId: governorate.id, flatFee: 75 } });
  });

  it("setCommissionRule self-audits with null from on first set, then the prior percentage on overwrite", async () => {
    const admin = await makeAdmin();
    const company = await makeCompany();

    const first = await setCommissionRule(company.id, admin.id, 10);
    const firstLog = await prisma.auditLog.findFirstOrThrow({
      where: { action: "shipping_commission_rule.update", targetId: first.id },
      orderBy: { createdAt: "desc" },
    });
    expect(firstLog.metadata).toEqual({ from: null, to: { commissionPercent: 10 } });

    const second = await setCommissionRule(company.id, admin.id, 20);
    const secondLog = await prisma.auditLog.findFirstOrThrow({
      where: { action: "shipping_commission_rule.update", targetId: second.id },
      orderBy: { createdAt: "desc" },
    });
    expect(secondLog.metadata).toEqual({ from: 10, to: { commissionPercent: 20 } });
  });
});

describe("computeSettlementForPeriod", () => {
  afterEach(cleanup);

  it("sums completed orders' shipping fees/commission within the period and records platform revenue", async () => {
    const company = await makeCompany();
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const periodStart = new Date(Date.now() - 60 * 60 * 1000);
    const periodEnd = new Date(Date.now() + 60 * 60 * 1000);

    const listing = await prisma.listing.create({
      data: { ownerId: seller.id, categoryId: category.id, title: "منتج" },
    });

    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        sellerId: seller.id,
        listingId: listing.id,
        fulfillmentMode: "PLATFORM_SHIPPING",
        productPrice: 500,
        shippingCompanyId: company.id,
        shippingFee: 60,
        shippingCommissionAmount: 6,
        totalAmount: 560,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    const settlement = await computeSettlementForPeriod(company.id, periodStart, periodEnd);
    expect(Number(settlement.totalShippingFees)).toBe(60);
    expect(Number(settlement.totalCommission)).toBe(6);

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { shippingSettlementId: settlement.id },
    });
    expect(ledgerEntry.type).toBe("SHIPPING_COMMISSION_REVENUE");
    expect(ledgerEntry.account).toBe("PLATFORM_REVENUE");
    expect(Number(ledgerEntry.amount)).toBe(6);
  });

  it("excludes orders outside the period and non-completed orders", async () => {
    const company = await makeCompany();
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: seller.id, categoryId: category.id, title: "منتج آخر" },
    });

    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        sellerId: seller.id,
        listingId: listing.id,
        fulfillmentMode: "PLATFORM_SHIPPING",
        productPrice: 300,
        shippingCompanyId: company.id,
        shippingFee: 40,
        shippingCommissionAmount: 4,
        totalAmount: 340,
        status: "PENDING",
      },
    });

    const settlement = await computeSettlementForPeriod(
      company.id,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
    );
    expect(Number(settlement.totalShippingFees)).toBe(0);
    expect(Number(settlement.totalCommission)).toBe(0);

    const ledgerCount = await prisma.ledgerEntry.count({
      where: { shippingSettlementId: settlement.id },
    });
    expect(ledgerCount).toBe(0);
  });

  it("does not record a ledger entry when there is nothing to settle", async () => {
    const company = await makeCompany();
    const settlement = await computeSettlementForPeriod(
      company.id,
      new Date(Date.now() - 1000),
      new Date(Date.now() + 1000),
    );
    const ledgerCount = await prisma.ledgerEntry.count({
      where: { shippingSettlementId: settlement.id },
    });
    expect(ledgerCount).toBe(0);
  });

  it("updateSettlementStatus transitions a settlement to INVOICED with a reference", async () => {
    const company = await makeCompany();
    const settlement = await computeSettlementForPeriod(
      company.id,
      new Date(Date.now() - 1000),
      new Date(Date.now() + 1000),
    );
    const result = await updateSettlementStatus(settlement.id, "INVOICED", "INV-001");
    expect(result).toEqual({ success: true });

    const updated = await prisma.shippingSettlement.findUniqueOrThrow({ where: { id: settlement.id } });
    expect(updated.status).toBe("INVOICED");
    expect(updated.invoiceReference).toBe("INV-001");
  });
});
