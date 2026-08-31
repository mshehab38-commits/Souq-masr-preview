import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listOrdersForBuyer, listOrdersForSeller } from "@/modules/orders/orders";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `orders-list-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeOrder(buyerId: string, sellerId: string, categoryId: string) {
  const listing = await prisma.listing.create({
    data: {
      ownerId: sellerId,
      categoryId,
      title: "منتج للطلب",
      status: "SOLD",
      price: 500,
      commerceEnabled: true,
      fulfillmentMode: "SELF_ARRANGED",
    },
  });
  return prisma.order.create({
    data: {
      buyerId,
      sellerId,
      listingId: listing.id,
      fulfillmentMode: "SELF_ARRANGED",
      productPrice: 500,
      totalAmount: 500,
      status: "PENDING",
    },
  });
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { sellerId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("listOrdersForBuyer", () => {
  afterEach(cleanup);

  it("paginates results and reports accurate totals", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    for (let i = 0; i < 5; i++) {
      await makeOrder(buyer.id, seller.id, category.id);
    }

    const firstPage = await listOrdersForBuyer(buyer.id, { limit: 2, page: 1 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.totalCount).toBe(5);
    expect(firstPage.totalPages).toBe(3);
    expect(firstPage.page).toBe(1);

    const lastPage = await listOrdersForBuyer(buyer.id, { limit: 2, page: 3 });
    expect(lastPage.items).toHaveLength(1);
  });

  it("never returns another buyer's orders", async () => {
    const buyer = await makeUser();
    const other = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    await makeOrder(other.id, seller.id, category.id);

    const result = await listOrdersForBuyer(buyer.id, {});
    expect(result.items).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("clamps an out-of-range limit to the maximum", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    await makeOrder(buyer.id, seller.id, category.id);

    const result = await listOrdersForBuyer(buyer.id, { limit: 10_000 });
    expect(result.items).toHaveLength(1);
  });
});

describe("listOrdersForSeller", () => {
  afterEach(cleanup);

  it("paginates results scoped to the seller", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    for (let i = 0; i < 3; i++) {
      await makeOrder(buyer.id, seller.id, category.id);
    }

    const result = await listOrdersForSeller(seller.id, { limit: 2, page: 1 });
    expect(result.items).toHaveLength(2);
    expect(result.totalCount).toBe(3);
    expect(result.totalPages).toBe(2);
  });

  it("never returns another seller's orders", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const otherSeller = await makeUser();
    const category = await makeCategory();
    await makeOrder(buyer.id, seller.id, category.id);

    const result = await listOrdersForSeller(otherSeller.id, {});
    expect(result.items).toHaveLength(0);
  });
});
