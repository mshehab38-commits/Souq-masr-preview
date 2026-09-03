import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { SearchFilters, SearchPage, SearchProvider, SearchResult } from "@/modules/search/types";
import { PostgresSearchProvider } from "@/modules/search/postgres-provider";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdListingIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `search-price-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeListing(ownerId: string, categoryId: string, price: number) {
  const listing = await prisma.listing.create({
    data: { ownerId, categoryId, title: "منتج للفلترة بالسعر", status: "ACTIVE", price },
  });
  createdListingIds.push(listing.id);
  return listing;
}

async function cleanupPriceFixtures() {
  await prisma.listing.deleteMany({ where: { id: { in: createdListingIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdListingIds.length = 0;
  createdCategoryIds.length = 0;
  createdUserIds.length = 0;
}

// A minimal fake, unrelated to Postgres, proving that anything coded against
// the SearchProvider interface (like this helper) never needs to know which
// concrete adapter it's talking to.
class FakeSearchProvider implements SearchProvider {
  public indexedIds: string[] = [];
  public removedIds: string[] = [];

  async search(_filters: SearchFilters, pagination: SearchPage): Promise<SearchResult> {
    return {
      items: [
        {
          id: "fake-1",
          title: "إعلان تجريبي",
          price: 100,
          currency: "EGP",
          negotiable: false,
          thumbnailUrl: null,
          governorateName: null,
          cityName: null,
          createdAt: new Date().toISOString(),
        },
      ],
      page: pagination.page,
      totalPages: 1,
      totalCount: 1,
    };
  }

  async index(listingId: string): Promise<void> {
    this.indexedIds.push(listingId);
  }

  async remove(listingId: string): Promise<void> {
    this.removedIds.push(listingId);
  }
}

// A generic consumer written only against the interface — this is what
// proves the abstraction boundary: it works unmodified against either
// adapter below.
async function countResults(provider: SearchProvider, filters: SearchFilters): Promise<number> {
  const result = await provider.search(filters, { page: 1, limit: 20 });
  return result.totalCount;
}

describe("SearchProvider interface boundary", () => {
  it("a fake provider satisfies the interface and works through the same generic consumer", async () => {
    const fake = new FakeSearchProvider();
    const count = await countResults(fake, { query: "test" });
    expect(count).toBe(1);
  });

  it("index()/remove() on the fake record calls without touching any real store", async () => {
    const fake = new FakeSearchProvider();
    await fake.index("listing-1");
    await fake.remove("listing-2");
    expect(fake.indexedIds).toEqual(["listing-1"]);
    expect(fake.removedIds).toEqual(["listing-2"]);
  });

  it("the real PostgresSearchProvider also satisfies the interface (type-level + smoke call)", async () => {
    const postgres: SearchProvider = new PostgresSearchProvider();
    const count = await countResults(postgres, { query: "a-query-that-matches-nothing-xyz" });
    expect(typeof count).toBe("number");
  });
});

// The price-range filter powers /search's UI form and is exercised end to
// end here — the field is real, tested, DB-backed behavior, not just a
// type on SearchFilters (see docs/DECISIONS.md's Phase 30 entry).
describe("PostgresSearchProvider price-range filtering", () => {
  afterEach(cleanupPriceFixtures);

  it("minPrice excludes listings priced below it", async () => {
    const user = await makeUser();
    const category = await makeCategory();
    const cheap = await makeListing(user.id, category.id, 50);
    const expensive = await makeListing(user.id, category.id, 500);

    const provider = new PostgresSearchProvider();
    const result = await provider.search({ categoryId: category.id, minPrice: 100 }, { page: 1, limit: 20 });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(expensive.id);
    expect(ids).not.toContain(cheap.id);
  });

  it("maxPrice excludes listings priced above it", async () => {
    const user = await makeUser();
    const category = await makeCategory();
    const cheap = await makeListing(user.id, category.id, 50);
    const expensive = await makeListing(user.id, category.id, 500);

    const provider = new PostgresSearchProvider();
    const result = await provider.search({ categoryId: category.id, maxPrice: 100 }, { page: 1, limit: 20 });

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(cheap.id);
    expect(ids).not.toContain(expensive.id);
  });

  it("minPrice and maxPrice together select only the listings inside the range", async () => {
    const user = await makeUser();
    const category = await makeCategory();
    const tooLow = await makeListing(user.id, category.id, 10);
    const inRange = await makeListing(user.id, category.id, 150);
    const tooHigh = await makeListing(user.id, category.id, 900);

    const provider = new PostgresSearchProvider();
    const result = await provider.search(
      { categoryId: category.id, minPrice: 100, maxPrice: 200 },
      { page: 1, limit: 20 },
    );

    const ids = result.items.map((item) => item.id);
    expect(ids).toEqual([inRange.id]);
    expect(ids).not.toContain(tooLow.id);
    expect(ids).not.toContain(tooHigh.id);
  });

  it("applies the same price range when a free-text query is also present", async () => {
    const user = await makeUser();
    const category = await makeCategory();
    const cheap = await prisma.listing.create({
      data: {
        ownerId: user.id,
        categoryId: category.id,
        title: "دراجة هوائية رخيصة",
        status: "ACTIVE",
        price: 50,
        searchText: "دراجه هوائيه رخيصه",
      },
    });
    createdListingIds.push(cheap.id);
    const expensive = await prisma.listing.create({
      data: {
        ownerId: user.id,
        categoryId: category.id,
        title: "دراجة هوائية غالية",
        status: "ACTIVE",
        price: 500,
        searchText: "دراجه هوائيه غاليه",
      },
    });
    createdListingIds.push(expensive.id);

    const provider = new PostgresSearchProvider();
    const result = await provider.search(
      { query: "دراجة", categoryId: category.id, minPrice: 100 },
      { page: 1, limit: 20 },
    );

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(expensive.id);
    expect(ids).not.toContain(cheap.id);
  });
});
