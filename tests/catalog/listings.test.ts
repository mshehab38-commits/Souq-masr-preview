import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import {
  createListing,
  listListingsByOwner,
  listPendingReviewListings,
  decidePendingListing,
} from "@/modules/catalog/listings";
import { updatePlatformSettings } from "@/modules/settings/settings";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ...overrides },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `create-listing-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("createListing", () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await redis.del(...createdUserIds.map((id) => `ratelimit:listing-create:${id}`));
    }
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.platformSettings.updateMany({
      where: { id: "singleton" },
      data: { freeListingActiveLimit: null, requirePrePublishReview: false },
    });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("creates an ACTIVE listing when requirePrePublishReview is off (default, unchanged behavior)", async () => {
    const owner = await makeUser();
    const category = await makeCategory();

    const result = await createListing(owner.id, { categoryId: category.id, title: "إعلان عادي" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: result.listingId } });
    expect(listing.status).toBe("ACTIVE");
  });

  it("creates a PENDING_REVIEW listing with a real expiresAt when requirePrePublishReview is on", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const owner = await makeUser();
    const category = await makeCategory();
    await updatePlatformSettings(admin.id, { requirePrePublishReview: true });

    const result = await createListing(owner.id, { categoryId: category.id, title: "إعلان يحتاج مراجعة" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: result.listingId } });
    expect(listing.status).toBe("PENDING_REVIEW");
    expect(listing.expiresAt).not.toBeNull();
  });

  it("a requirePrePublishReview listing flows through the existing pending-review queue unchanged", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const owner = await makeUser();
    const category = await makeCategory();
    await updatePlatformSettings(admin.id, { requirePrePublishReview: true });

    const result = await createListing(owner.id, { categoryId: category.id, title: "إعلان في قائمة المراجعة" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const queue = await listPendingReviewListings();
    expect(queue.items.some((item) => item.id === result.listingId)).toBe(true);

    const decided = await decidePendingListing(result.listingId, "APPROVE");
    expect(decided).not.toBeNull();

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: result.listingId } });
    expect(listing.status).toBe("ACTIVE");
    expect(listing.expiresAt).not.toBeNull();
  });

  it("creates an ACTIVE listing when no limit is configured (fails open)", async () => {
    const owner = await makeUser();
    const category = await makeCategory();

    const result = await createListing(owner.id, { categoryId: category.id, title: "دراجة للبيع" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: result.listingId } });
    expect(listing.status).toBe("ACTIVE");
    expect(listing.ownerId).toBe(owner.id);
  });

  it("rejects with listing_limit_reached once the owner's active-listing cap is met", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const owner = await makeUser();
    const category = await makeCategory();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 1 });

    const first = await createListing(owner.id, { categoryId: category.id, title: "إعلان أول" });
    expect(first.success).toBe(true);

    const second = await createListing(owner.id, { categoryId: category.id, title: "إعلان ثاني" });
    expect(second).toEqual({ success: false, error: "listing_limit_reached", limit: 1 });
  });

  it("under two concurrent creates against a limit of one, exactly one succeeds", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const owner = await makeUser();
    const category = await makeCategory();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 1 });

    const [resultA, resultB] = await Promise.all([
      createListing(owner.id, { categoryId: category.id, title: "إعلان أ" }),
      createListing(owner.id, { categoryId: category.id, title: "إعلان ب" }),
    ]);

    const results = [resultA, resultB];
    const wins = results.filter((r) => r.success);
    const losses = results.filter((r) => !r.success);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({ success: false, error: "listing_limit_reached" });

    const activeCount = await prisma.listing.count({ where: { ownerId: owner.id, status: "ACTIVE" } });
    expect(activeCount).toBe(1);
  });

  it("rate-limits listing creation after 20 creates within the window, per owner", async () => {
    const owner = await makeUser();
    const category = await makeCategory();

    for (let i = 0; i < 20; i++) {
      const result = await createListing(owner.id, { categoryId: category.id, title: `إعلان رقم ${i}` });
      expect(result.success).toBe(true);
    }

    const rateLimited = await createListing(owner.id, { categoryId: category.id, title: "إعلان زائد" });
    expect(rateLimited).toEqual({ success: false, error: "rate_limited" });
  });

  it("does not rate-limit a different owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const category = await makeCategory();

    for (let i = 0; i < 20; i++) {
      await createListing(owner.id, { categoryId: category.id, title: `إعلان رقم ${i}` });
    }

    const otherResult = await createListing(other.id, { categoryId: category.id, title: "إعلان مالك آخر" });
    expect(otherResult.success).toBe(true);
  });
});

describe("listListingsByOwner", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("paginates results and reports accurate totals", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    for (let i = 0; i < 5; i++) {
      await prisma.listing.create({
        data: { ownerId: owner.id, categoryId: category.id, title: `إعلان ${i}`, status: "ACTIVE" },
      });
    }

    const firstPage = await listListingsByOwner(owner.id, { limit: 2, page: 1 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.totalCount).toBe(5);
    expect(firstPage.totalPages).toBe(3);

    const lastPage = await listListingsByOwner(owner.id, { limit: 2, page: 3 });
    expect(lastPage.items).toHaveLength(1);
  });

  it("never returns another owner's listings, and excludes soft-deleted ones", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const category = await makeCategory();
    await prisma.listing.create({
      data: { ownerId: other.id, categoryId: category.id, title: "ليس لك", status: "ACTIVE" },
    });
    await prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: category.id,
        title: "محذوف",
        status: "REMOVED",
        deletedAt: new Date(),
      },
    });

    const result = await listListingsByOwner(owner.id, {});
    expect(result.items).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("clamps an out-of-range limit to the maximum", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان", status: "ACTIVE" },
    });

    const result = await listListingsByOwner(owner.id, { limit: 10_000 });
    expect(result.items).toHaveLength(1);
  });
});
