import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveActor, transitionOrder } from "@/modules/orders/transitions";

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
    data: { slug: `trans-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeOrder(
  buyerId: string,
  sellerId: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  const listing = await prisma.listing.create({
    data: {
      ownerId: sellerId,
      categoryId,
      title: "منتج قيد الطلب",
      status: "SOLD",
      price: 500,
      commerceEnabled: true,
      fulfillmentMode: "SELF_ARRANGED",
    },
  });

  const order = await prisma.order.create({
    data: {
      buyerId,
      sellerId,
      listingId: listing.id,
      fulfillmentMode: "SELF_ARRANGED",
      productPrice: 500,
      totalAmount: 500,
      status: "PENDING",
      ...overrides,
    },
  });

  return { order, listing };
}

async function cleanup() {
  await prisma.ledgerEntry.deleteMany({ where: { order: { sellerId: { in: createdUserIds } } } });
  await prisma.sellerPayout.deleteMany({ where: { sellerId: { in: createdUserIds } } });
  await prisma.order.deleteMany({ where: { sellerId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("resolveActor", () => {
  it("resolves ADMIN regardless of buyer/seller identity when isAdmin is true", () => {
    const order = { buyerId: "b1", sellerId: "s1" };
    expect(resolveActor(order, "someone-else", true)).toBe("ADMIN");
  });

  it("resolves BUYER when the user matches buyerId", () => {
    const order = { buyerId: "b1", sellerId: "s1" };
    expect(resolveActor(order, "b1", false)).toBe("BUYER");
  });

  it("resolves SELLER when the user matches sellerId", () => {
    const order = { buyerId: "b1", sellerId: "s1" };
    expect(resolveActor(order, "s1", false)).toBe("SELLER");
  });

  it("resolves null for a user who is neither party nor admin", () => {
    const order = { buyerId: "b1", sellerId: "s1" };
    expect(resolveActor(order, "stranger", false)).toBeNull();
  });
});

describe("transitionOrder", () => {
  afterEach(cleanup);

  it("returns not_found for a nonexistent order", async () => {
    const buyer = await makeUser();
    const result = await transitionOrder("does-not-exist", buyer.id, false, { targetStatus: "CONFIRMED" });
    expect(result).toEqual({ success: false, error: "not_found" });
  });

  it("returns forbidden for a user who is neither the buyer, seller, nor admin", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const stranger = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    const result = await transitionOrder(order.id, stranger.id, false, { targetStatus: "CONFIRMED" });
    expect(result).toEqual({ success: false, error: "forbidden" });
  });

  it("rejects the buyer trying to confirm their own order (seller-only action)", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    const result = await transitionOrder(order.id, buyer.id, false, { targetStatus: "CONFIRMED" });
    expect(result).toEqual({ success: false, error: "invalid_transition" });
  });

  it("lets the seller confirm and sets confirmedAt", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    const result = await transitionOrder(order.id, seller.id, false, { targetStatus: "CONFIRMED" });
    expect(result).toEqual({ success: true });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.confirmedAt).not.toBeNull();
  });

  it("rejects any further transition once an order is in a terminal status", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id, { status: "COMPLETED" });

    const result = await transitionOrder(order.id, seller.id, false, { targetStatus: "CANCELLED" });
    expect(result).toEqual({ success: false, error: "invalid_transition" });
  });

  it("cancelling releases the listing reservation back to ACTIVE with a fresh expiry", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order, listing } = await makeOrder(buyer.id, seller.id, category.id);

    const result = await transitionOrder(order.id, buyer.id, false, {
      targetStatus: "CANCELLED",
      cancelReason: "لم أعد أرغب بالشراء",
    });
    expect(result).toEqual({ success: true });

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe("CANCELLED");
    expect(updatedOrder.cancelledBy).toBe("BUYER");
    expect(updatedOrder.cancelReason).toBe("لم أعد أرغب بالشراء");
    expect(updatedOrder.cancelledAt).not.toBeNull();

    const updatedListing = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updatedListing.status).toBe("ACTIVE");
    expect(updatedListing.expiresAt).not.toBeNull();
    expect(updatedListing.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("admin can cancel from any actor-restricted state as an override", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const admin = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id, { status: "READY_FOR_PICKUP" });

    const result = await transitionOrder(order.id, admin.id, true, { targetStatus: "CANCELLED" });
    expect(result).toEqual({ success: true });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.cancelledBy).toBe("ADMIN");
  });

  it("does not reactivate the listing if it was already sold to someone else (not this order's SOLD state)", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order, listing } = await makeOrder(buyer.id, seller.id, category.id);

    // Simulate the listing having already moved on (e.g. re-sold via a
    // completed second order) before this stale order gets cancelled.
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "EXPIRED" } });

    await transitionOrder(order.id, buyer.id, false, { targetStatus: "CANCELLED" });

    const updatedListing = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updatedListing.status).toBe("EXPIRED");
  });

  it("COD order completion creates no ledger entry and no seller payout — the buyer already paid the seller directly", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id, {
      status: "DELIVERED",
      paymentMethod: "CASH_ON_DELIVERY",
    });

    const result = await transitionOrder(order.id, buyer.id, false, { targetStatus: "COMPLETED" });
    expect(result).toEqual({ success: true });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt).not.toBeNull();

    const ledgerCount = await prisma.ledgerEntry.count({ where: { orderId: order.id } });
    expect(ledgerCount).toBe(0);
    const payoutCount = await prisma.sellerPayout.count({ where: { orderId: order.id } });
    expect(payoutCount).toBe(0);
  });

  it("an ONLINE order completion records the full product price as a seller payable — zero commission deducted", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id, {
      status: "DELIVERED",
      paymentMethod: "ONLINE",
      productPrice: 750,
    });

    const result = await transitionOrder(order.id, buyer.id, false, { targetStatus: "COMPLETED" });
    expect(result).toEqual({ success: true });

    const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { orderId: order.id } });
    expect(ledgerEntry.type).toBe("SELLER_PAYOUT");
    expect(ledgerEntry.account).toBe("SELLER_PAYABLE");
    expect(Number(ledgerEntry.amount)).toBe(750);

    const payout = await prisma.sellerPayout.findFirstOrThrow({ where: { orderId: order.id } });
    expect(Number(payout.amount)).toBe(750);
    expect(payout.sellerId).toBe(seller.id);
  });

  it("under two concurrent transitions on the same order from the same state, exactly one wins", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    const [resultA, resultB] = await Promise.all([
      transitionOrder(order.id, seller.id, false, { targetStatus: "CONFIRMED" }),
      transitionOrder(order.id, seller.id, false, { targetStatus: "CONFIRMED" }),
    ]);

    const results = [resultA, resultB];
    const wins = results.filter((r) => r.success);
    const losses = results.filter((r) => !r.success);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toEqual({ success: false, error: "invalid_transition" });

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CONFIRMED");
  });

  it("walks a SELF_ARRANGED order through the full happy path to COMPLETED", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    const steps: Array<{ actorId: string; isAdmin: boolean; target: "CONFIRMED" | "PREPARING" | "DELIVERED" | "COMPLETED" }> = [
      { actorId: seller.id, isAdmin: false, target: "CONFIRMED" },
      { actorId: seller.id, isAdmin: false, target: "PREPARING" },
      { actorId: seller.id, isAdmin: false, target: "DELIVERED" },
      { actorId: buyer.id, isAdmin: false, target: "COMPLETED" },
    ];

    for (const step of steps) {
      const result = await transitionOrder(order.id, step.actorId, step.isAdmin, { targetStatus: step.target });
      expect(result).toEqual({ success: true });
    }

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("COMPLETED");
  });
});
