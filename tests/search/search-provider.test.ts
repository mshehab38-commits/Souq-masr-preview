import { describe, expect, it } from "vitest";
import type { SearchFilters, SearchPage, SearchProvider, SearchResult } from "@/modules/search/types";
import { PostgresSearchProvider } from "@/modules/search/postgres-provider";

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
