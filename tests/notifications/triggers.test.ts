import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/checkout";
import { transitionOrder } from "@/modules/orders/transitions";
import { createReport, resolveReport } from "@/modules/moderation/reports";
import { reviewVerificationRequest } from "@/modules/identity/verification";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdRequestIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `notif-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeCommerceListing(ownerId: string, categoryId: string) {
  return prisma.listing.create({
    data: {
      ownerId,
      categoryId,
      title: "منتج قابل للشراء",
      status: "ACTIVE",
      price: 200,
      commerceEnabled: true,
      fulfillmentMode: "SELF_ARRANGED",
    },
  });
}

async function makeOrder(buyerId: string, sellerId: string, categoryId: string) {
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
    },
  });
  return { order, listing };
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.report.deleteMany({ where: { reporterId: { in: createdUserIds } } });
  await prisma.verificationRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  await prisma.order.deleteMany({ where: { sellerId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
  createdRequestIds.length = 0;
}

describe("checkout notifies the seller of a new order", () => {
  afterEach(cleanup);

  it("creates a NEW_ORDER notification for the listing owner", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await makeCommerceListing(seller.id, category.id);

    const result = await createOrder(buyer.id, { listingId: listing.id });
    expect(result.success).toBe(true);

    const notifications = await prisma.notification.findMany({ where: { userId: seller.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("NEW_ORDER");
  });
});

describe("order transitions notify the counterparty, not the actor", () => {
  afterEach(cleanup);

  it("notifies the seller (not the buyer) when the buyer cancels", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    const result = await transitionOrder(order.id, buyer.id, false, { targetStatus: "CANCELLED" });
    expect(result).toEqual({ success: true });

    const buyerNotifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
    const sellerNotifications = await prisma.notification.findMany({ where: { userId: seller.id } });
    expect(buyerNotifications).toHaveLength(0);
    expect(sellerNotifications).toHaveLength(1);
    expect(sellerNotifications[0]!.type).toBe("ORDER_STATUS_CHANGED");
  });

  it("notifies both parties when an admin transitions the order", async () => {
    const buyer = await makeUser();
    const seller = await makeUser();
    const admin = await makeUser();
    const category = await makeCategory();
    const { order } = await makeOrder(buyer.id, seller.id, category.id);

    await transitionOrder(order.id, admin.id, true, { targetStatus: "CANCELLED" });

    const buyerNotifications = await prisma.notification.findMany({ where: { userId: buyer.id } });
    const sellerNotifications = await prisma.notification.findMany({ where: { userId: seller.id } });
    expect(buyerNotifications).toHaveLength(1);
    expect(sellerNotifications).toHaveLength(1);
  });
});

describe("report resolution notifies the reporter, and the listing owner on removal", () => {
  afterEach(cleanup);

  it("notifies only the reporter on a dismissed report", async () => {
    const reporter = await makeUser();
    const target = await makeUser();
    const moderator = await makeUser();
    const created = await createReport(reporter.id, { targetType: "USER", targetUserId: target.id, reason: "OTHER" });
    if (!created.success || !created.report) throw new Error("setup failed");

    await resolveReport(created.report.id, moderator.id, { decision: "DISMISS" });

    const reporterNotifications = await prisma.notification.findMany({ where: { userId: reporter.id } });
    expect(reporterNotifications).toHaveLength(1);
    expect(reporterNotifications[0]!.type).toBe("REPORT_RESOLVED");
  });

  it("notifies both the reporter and the listing owner when the listing is removed", async () => {
    const reporter = await makeUser();
    const seller = await makeUser();
    const moderator = await makeUser();
    const category = await makeCategory();
    const listing = await makeCommerceListing(seller.id, category.id);

    const created = await createReport(reporter.id, {
      targetType: "LISTING",
      listingId: listing.id,
      reason: "PROHIBITED_ITEM",
    });
    if (!created.success || !created.report) throw new Error("setup failed");

    await resolveReport(created.report.id, moderator.id, {
      decision: "ACTION_TAKEN",
      action: "REMOVE_LISTING",
    });

    const reporterNotifications = await prisma.notification.findMany({ where: { userId: reporter.id } });
    const sellerNotifications = await prisma.notification.findMany({ where: { userId: seller.id } });
    expect(reporterNotifications).toHaveLength(1);
    expect(sellerNotifications).toHaveLength(1);
    expect(sellerNotifications[0]!.type).toBe("LISTING_REMOVED");
  });
});

describe("verification review notifies the requesting user", () => {
  afterEach(cleanup);

  it("notifies the user on approval", async () => {
    const user = await makeUser();
    const admin = await makeUser();
    const request = await prisma.verificationRequest.create({
      data: { userId: user.id, type: "INDIVIDUAL_SELLER" },
    });
    createdRequestIds.push(request.id);

    await reviewVerificationRequest(request.id, admin.id, "APPROVED");

    const notifications = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("VERIFICATION_REVIEWED");
  });
});
