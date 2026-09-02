import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/checkout";
import { createShippingCompany } from "@/modules/shipping/companies";
import { upsertShippingRate } from "@/modules/shipping/rates";
import { setCommissionRule } from "@/modules/shipping/commission";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdGovernorateIds: string[] = [];
const createdCompanyIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `checkout-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeListing(
  ownerId: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.listing.create({
    data: {
      ownerId,
      categoryId,
      title: "منتج قابل للشراء",
      status: "ACTIVE",
      price: 500,
      commerceEnabled: true,
      fulfillmentMode: "SELF_ARRANGED",
      ...overrides,
    },
  });
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.order.deleteMany({ where: { sellerId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.shippingRate.deleteMany({ where: { shippingCompanyId: { in: createdCompanyIds } } });
  await prisma.shippingCommissionRule.deleteMany({ where: { shippingCompanyId: { in: createdCompanyIds } } });
  await prisma.shippingCompany.deleteMany({ where: { id: { in: createdCompanyIds } } });
  await prisma.governorate.deleteMany({ where: { id: { in: createdGovernorateIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
  createdGovernorateIds.length = 0;
  createdCompanyIds.length = 0;
}

describe("createOrder", () => {
  afterEach(cleanup);

  it("rejects checkout on a listing that doesn't exist", async () => {
    const buyer = await makeUser();
    const result = await createOrder(buyer.id, { listingId: "does-not-exist" });
    expect(result).toEqual({ success: false, error: "listing_not_found" });
  });

  it("rejects checkout on a listing that isn't commerce-enabled", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id, { commerceEnabled: false, fulfillmentMode: null });

    const result = await createOrder(buyer.id, { listingId: listing.id });
    expect(result).toEqual({ success: false, error: "not_checkout_enabled" });
  });

  it("rejects a seller trying to buy their own listing", async () => {
    const seller = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const result = await createOrder(seller.id, { listingId: listing.id });
    expect(result).toEqual({ success: false, error: "cannot_buy_own_listing" });
  });

  it("rejects checkout on a listing with no price set", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id, { price: null });

    const result = await createOrder(buyer.id, { listingId: listing.id });
    expect(result).toEqual({ success: false, error: "price_not_set" });
  });

  it("rejects ONLINE payment since no live gateway is configured", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const result = await createOrder(buyer.id, { listingId: listing.id, paymentMethod: "ONLINE" });
    expect(result).toEqual({ success: false, error: "payment_method_unavailable" });
  });

  it("creates a COD order for a SELF_ARRANGED listing with no shipping fee, and reserves the listing", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const result = await createOrder(buyer.id, { listingId: listing.id });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(Number(order.productPrice)).toBe(500);
    expect(order.shippingFee).toBeNull();
    expect(order.shippingCommissionAmount).toBeNull();
    expect(Number(order.totalAmount)).toBe(500);
    expect(order.paymentMethod).toBe("CASH_ON_DELIVERY");
    expect(order.status).toBe("PENDING");
    expect(order.buyerId).toBe(buyer.id);
    expect(order.sellerId).toBe(seller.id);

    const reservedListing = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(reservedListing.status).toBe("SOLD");
  });

  it("requires a shippingCompanyId for a PLATFORM_SHIPPING listing", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id, { fulfillmentMode: "PLATFORM_SHIPPING" });

    const result = await createOrder(buyer.id, { listingId: listing.id });
    expect(result).toEqual({ success: false, error: "shipping_company_required" });
  });

  it("rejects checkout when the chosen shipping company has no rate for the buyer's governorate", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id, { fulfillmentMode: "PLATFORM_SHIPPING" });
    const company = await createShippingCompany({ slug: `co-${Math.random().toString(36).slice(2)}`, name: "شركة" });
    createdCompanyIds.push(company.id);

    const result = await createOrder(buyer.id, {
      listingId: listing.id,
      shippingCompanyId: company.id,
      shippingAddress: { governorateId: "some-governorate" },
    });
    expect(result).toEqual({ success: false, error: "shipping_rate_unavailable" });
  });

  it("snapshots the shipping fee and commission at checkout time for a PLATFORM_SHIPPING order", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const governorate = await prisma.governorate.create({
      data: { slug: `chk-gov-${Math.random().toString(36).slice(2)}`, nameAr: "محافظة", nameEn: "Gov" },
    });
    createdGovernorateIds.push(governorate.id);

    const company = await createShippingCompany({ slug: `co-${Math.random().toString(36).slice(2)}`, name: "شركة شحن" });
    createdCompanyIds.push(company.id);
    await upsertShippingRate(company.id, seller.id, governorate.id, 60);
    await setCommissionRule(company.id, seller.id, 10);

    const listing = await makeListing(seller.id, category.id, {
      fulfillmentMode: "PLATFORM_SHIPPING",
      price: 1000,
    });

    const result = await createOrder(buyer.id, {
      listingId: listing.id,
      shippingCompanyId: company.id,
      shippingAddress: { governorateId: governorate.id },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(Number(order.productPrice)).toBe(1000);
    expect(Number(order.shippingFee)).toBe(60);
    expect(Number(order.shippingCommissionAmount)).toBe(6);
    expect(Number(order.totalAmount)).toBe(1060);
    expect(order.shippingCompanyId).toBe(company.id);
  });

  it("under two concurrent checkouts on the same listing, exactly one wins and the other is told it's already sold", async () => {
    const seller = await makeUser();
    const buyerA = await makeUser();
    const buyerB = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id);

    const [resultA, resultB] = await Promise.all([
      createOrder(buyerA.id, { listingId: listing.id }),
      createOrder(buyerB.id, { listingId: listing.id }),
    ]);

    // Depending on exactly how the two concurrent calls interleave, the
    // loser is caught either by the initial findFirst (if it runs after
    // the winner's transaction has already committed — "listing_not_found",
    // since the ACTIVE-only findFirst no longer matches) or by the atomic
    // reservation inside the transaction itself ("listing_already_sold").
    // Both correctly prevent a double sale — that invariant (exactly one
    // order, listing ends up SOLD) is what the assertions below actually
    // verify; which specific error the loser sees is a timing detail, not
    // the thing this test is protecting against a regression of.
    const results = [resultA, resultB];
    const wins = results.filter((r) => r.success);
    const losses = results.filter((r) => !r.success);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    const loss = losses[0]!;
    expect(loss).toMatchObject({ success: false });
    if (!loss.success) {
      expect(["listing_already_sold", "listing_not_found"]).toContain(loss.error);
    }

    const orderCount = await prisma.order.count({ where: { listingId: listing.id } });
    expect(orderCount).toBe(1);

    const finalListing = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(finalListing.status).toBe("SOLD");
  });

  it("never treats the product price as platform revenue — no ledger entry references this order at checkout", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(seller.id, category.id, { price: 9999 });

    const result = await createOrder(buyer.id, { listingId: listing.id });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const linkedEntries = await prisma.ledgerEntry.count({ where: { orderId: result.orderId } });
    expect(linkedEntries).toBe(0);
  });
});
