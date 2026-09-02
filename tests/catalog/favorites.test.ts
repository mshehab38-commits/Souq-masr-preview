import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listFavoriteListings, isListingFavorited } from "@/modules/catalog/favorites";

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
    data: { slug: `favorites-list-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeFavorite(userId: string, ownerId: string, categoryId: string) {
  const listing = await prisma.listing.create({
    data: { ownerId, categoryId, title: "إعلان مفضل", status: "ACTIVE" },
  });
  return prisma.favorite.create({ data: { userId, listingId: listing.id } });
}

async function cleanup() {
  await prisma.favorite.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("listFavoriteListings", () => {
  afterEach(cleanup);

  it("paginates results and reports accurate totals", async () => {
    const user = await makeUser();
    const owner = await makeUser();
    const category = await makeCategory();
    for (let i = 0; i < 5; i++) {
      await makeFavorite(user.id, owner.id, category.id);
    }

    const firstPage = await listFavoriteListings(user.id, { limit: 2, page: 1 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.totalCount).toBe(5);
    expect(firstPage.totalPages).toBe(3);
    expect(firstPage.page).toBe(1);

    const lastPage = await listFavoriteListings(user.id, { limit: 2, page: 3 });
    expect(lastPage.items).toHaveLength(1);
  });

  it("never returns another user's favorites", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const owner = await makeUser();
    const category = await makeCategory();
    await makeFavorite(other.id, owner.id, category.id);

    const result = await listFavoriteListings(user.id, {});
    expect(result.items).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("clamps an out-of-range limit to the maximum", async () => {
    const user = await makeUser();
    const owner = await makeUser();
    const category = await makeCategory();
    await makeFavorite(user.id, owner.id, category.id);

    const result = await listFavoriteListings(user.id, { limit: 10_000 });
    expect(result.items).toHaveLength(1);
  });
});

describe("isListingFavorited", () => {
  afterEach(cleanup);

  it("returns true once the user has favorited the listing", async () => {
    const user = await makeUser();
    const owner = await makeUser();
    const category = await makeCategory();
    const favorite = await makeFavorite(user.id, owner.id, category.id);

    expect(await isListingFavorited(user.id, favorite.listingId)).toBe(true);
  });

  it("returns false when the user has never favorited the listing", async () => {
    const user = await makeUser();
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان غير مفضل", status: "ACTIVE" },
    });

    expect(await isListingFavorited(user.id, listing.id)).toBe(false);
  });

  it("is scoped per user — one user's favorite doesn't leak into another's check", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const owner = await makeUser();
    const category = await makeCategory();
    const favorite = await makeFavorite(other.id, owner.id, category.id);

    expect(await isListingFavorited(user.id, favorite.listingId)).toBe(false);
    expect(await isListingFavorited(other.id, favorite.listingId)).toBe(true);
  });
});
