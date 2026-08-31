import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { bulkUpdateListings, checkBulkActionRateLimit, renewListing } from "@/modules/catalog/listings";

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
    data: { slug: `bulk-test-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeListing(ownerId: string, categoryId: string, overrides: Record<string, unknown> = {}) {
  return prisma.listing.create({
    data: { ownerId, categoryId, title: "إعلان اختباري", status: "ACTIVE", ...overrides },
  });
}

describe("bulkUpdateListings", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("marks the caller's own listings as sold", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);

    const result = await bulkUpdateListings(owner.id, [listing.id], "mark_sold");
    expect(result).toEqual({ requested: 1, affected: 1 });

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("SOLD");
  });

  it("never affects another seller's listings, even if their ID is included", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const category = await makeCategory();
    const ownListing = await makeListing(owner.id, category.id);
    const strangerListing = await makeListing(stranger.id, category.id);

    const result = await bulkUpdateListings(owner.id, [ownListing.id, strangerListing.id], "mark_sold");
    expect(result).toEqual({ requested: 2, affected: 1 });

    const strangerAfter = await prisma.listing.findUniqueOrThrow({ where: { id: strangerListing.id } });
    expect(strangerAfter.status).toBe("ACTIVE");
  });

  it("soft-deletes on the delete action", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);

    const result = await bulkUpdateListings(owner.id, [listing.id], "delete");
    expect(result).toEqual({ requested: 1, affected: 1 });

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("REMOVED");
    expect(updated.deletedAt).not.toBeNull();
  });

  it("relist only affects SOLD/EXPIRED listings, setting a fresh expiresAt", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const sold = await makeListing(owner.id, category.id, { status: "SOLD" });
    const active = await makeListing(owner.id, category.id, { status: "ACTIVE" });

    const result = await bulkUpdateListings(owner.id, [sold.id, active.id], "relist");
    expect(result).toEqual({ requested: 2, affected: 1 });

    const soldAfter = await prisma.listing.findUniqueOrThrow({ where: { id: sold.id } });
    expect(soldAfter.status).toBe("ACTIVE");
    expect(soldAfter.expiresAt).not.toBeNull();
    expect(soldAfter.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("checkBulkActionRateLimit", () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await redis.del(...createdUserIds.map((id) => `ratelimit:listing-bulk:${id}`));
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  it("allows up to 30 calls per owner within the window, then rejects the 31st", async () => {
    const owner = await makeUser();

    for (let i = 0; i < 30; i++) {
      expect(await checkBulkActionRateLimit(owner.id)).toBe(true);
    }
    expect(await checkBulkActionRateLimit(owner.id)).toBe(false);
  });

  it("tracks limits independently per owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();

    for (let i = 0; i < 30; i++) {
      await checkBulkActionRateLimit(owner.id);
    }
    expect(await checkBulkActionRateLimit(owner.id)).toBe(false);
    expect(await checkBulkActionRateLimit(other.id)).toBe(true);
  });
});

describe("renewListing", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("renews an EXPIRED listing back to ACTIVE with a future expiresAt", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id, {
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await renewListing(listing.id, owner.id);
    expect(result).toEqual({ success: true });

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to renew a SOLD listing (use relist instead)", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id, { status: "SOLD" });

    const result = await renewListing(listing.id, owner.id);
    expect(result).toEqual({ success: false, error: "not_found" });
  });

  it("refuses to renew another seller's listing", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id, { status: "EXPIRED" });

    const result = await renewListing(listing.id, stranger.id);
    expect(result).toEqual({ success: false, error: "not_found" });
  });
});
