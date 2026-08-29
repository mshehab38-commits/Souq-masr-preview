import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createSavedSearch,
  listSavedSearches,
  deleteSavedSearch,
  matchesListing,
  notifyMatchingSavedSearches,
} from "@/modules/search/saved-searches";

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
    data: { slug: `saved-search-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function cleanup() {
  await prisma.savedSearch.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("createSavedSearch / listSavedSearches / deleteSavedSearch", () => {
  afterEach(cleanup);

  it("creates and lists a saved search for its owner", async () => {
    const user = await makeUser();
    const result = await createSavedSearch(user.id, "شقق حلوان", { q: "شقة", governorate: "helwan" });
    expect(result.success).toBe(true);

    const list = await listSavedSearches(user.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("شقق حلوان");
  });

  it("enforces a per-user cap", async () => {
    const user = await makeUser();
    for (let i = 0; i < 20; i++) {
      const result = await createSavedSearch(user.id, `بحث ${i}`, { q: `كلمة${i}` });
      expect(result.success).toBe(true);
    }

    const oneTooMany = await createSavedSearch(user.id, "بحث زائد", { q: "زائد" });
    expect(oneTooMany).toEqual({ success: false, error: "limit_reached" });
  });

  it("deletes only the owner's saved search", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const created = await createSavedSearch(owner.id, "بحثي", { q: "شيء" });
    if (!created.success) throw new Error("setup failed");

    expect(await deleteSavedSearch(created.id, stranger.id)).toBe(false);
    expect(await deleteSavedSearch(created.id, owner.id)).toBe(true);
    expect(await listSavedSearches(owner.id)).toHaveLength(0);
  });
});

describe("matchesListing", () => {
  it("matches on category, governorate, and city slugs", () => {
    const listing = { categorySlug: "cars", governorateSlug: "cairo", citySlug: "nasr-city", price: 100, searchText: "سيارة تويوتا" };

    expect(matchesListing({ category: "cars" }, listing)).toBe(true);
    expect(matchesListing({ category: "electronics" }, listing)).toBe(false);
    expect(matchesListing({ governorate: "cairo" }, listing)).toBe(true);
    expect(matchesListing({ governorate: "giza" }, listing)).toBe(false);
    expect(matchesListing({ city: "nasr-city" }, listing)).toBe(true);
    expect(matchesListing({ city: "maadi" }, listing)).toBe(false);
  });

  it("matches on price range, treating a priceless listing as non-matching when a range is set", () => {
    const priced = { categorySlug: "cars", governorateSlug: null, citySlug: null, price: 500, searchText: "" };
    const priceless = { ...priced, price: null };

    expect(matchesListing({ minPrice: 100, maxPrice: 1000 }, priced)).toBe(true);
    expect(matchesListing({ minPrice: 600 }, priced)).toBe(false);
    expect(matchesListing({ maxPrice: 400 }, priced)).toBe(false);
    expect(matchesListing({ minPrice: 100 }, priceless)).toBe(false);
  });

  it("matches free text against the normalized searchText", () => {
    const listing = { categorySlug: "cars", governorateSlug: null, citySlug: null, price: 100, searchText: "سيارة تويوتا كورولا" };

    expect(matchesListing({ q: "تويوتا" }, listing)).toBe(true);
    expect(matchesListing({ q: "مرسيدس" }, listing)).toBe(false);
  });

  it("matches everything when the query has no filters set", () => {
    const listing = { categorySlug: "cars", governorateSlug: null, citySlug: null, price: null, searchText: null };
    expect(matchesListing({}, listing)).toBe(true);
  });
});

describe("notifyMatchingSavedSearches", () => {
  afterEach(cleanup);

  it("notifies a user whose saved search matches the new listing", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: {
        ownerId: seller.id,
        categoryId: category.id,
        title: "سيارة تويوتا للبيع",
        status: "ACTIVE",
        searchText: "سياره تويوتا للبيع",
      },
    });
    await createSavedSearch(buyer.id, "تويوتا", { q: "تويوتا", category: category.slug });

    const notifiedCount = await notifyMatchingSavedSearches(listing.id);
    expect(notifiedCount).toBe(1);

    const notification = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: "SAVED_SEARCH_MATCH" },
    });
    expect(notification).not.toBeNull();
    expect(notification?.link).toBe(`/listings/${listing.id}`);
  });

  it("sends only one notification per user even if multiple saved searches match", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: {
        ownerId: seller.id,
        categoryId: category.id,
        title: "سيارة تويوتا للبيع",
        status: "ACTIVE",
        searchText: "سياره تويوتا للبيع",
      },
    });
    await createSavedSearch(buyer.id, "بحث أول", { category: category.slug });
    await createSavedSearch(buyer.id, "بحث ثاني", { q: "تويوتا" });

    const notifiedCount = await notifyMatchingSavedSearches(listing.id);
    expect(notifiedCount).toBe(1);

    const notifications = await prisma.notification.findMany({
      where: { userId: buyer.id, type: "SAVED_SEARCH_MATCH" },
    });
    expect(notifications).toHaveLength(1);
  });

  it("does not notify for a non-matching saved search", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const otherCategory = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: seller.id, categoryId: category.id, title: "إعلان", status: "ACTIVE" },
    });
    await createSavedSearch(buyer.id, "بحث غير مطابق", { category: otherCategory.slug });

    expect(await notifyMatchingSavedSearches(listing.id)).toBe(0);
  });

  it("does nothing for a listing that isn't ACTIVE", async () => {
    const seller = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: seller.id, categoryId: category.id, title: "مسودة", status: "DRAFT" },
    });

    expect(await notifyMatchingSavedSearches(listing.id)).toBe(0);
  });
});
