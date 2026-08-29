import { prisma } from "@/lib/db";
import { createNotification } from "@/modules/notifications/service";
import { normalizeArabicText } from "@/modules/catalog/service";
import type { RawSearchParams } from "./query-params";

const MAX_SAVED_SEARCHES_PER_USER = 20;

export type CreateSavedSearchResult =
  | { success: true; id: string }
  | { success: false; error: "limit_reached" };

// Capped per user — a simple technical safeguard against unbounded rows
// (and, transitively, unbounded per-listing match-checking work in
// notifyMatchingSavedSearches below), the same category of guard as the
// report rate limiter, not a product/pricing decision.
export async function createSavedSearch(
  userId: string,
  name: string,
  query: RawSearchParams,
): Promise<CreateSavedSearchResult> {
  const count = await prisma.savedSearch.count({ where: { userId } });
  if (count >= MAX_SAVED_SEARCHES_PER_USER) {
    return { success: false, error: "limit_reached" };
  }

  const saved = await prisma.savedSearch.create({
    data: { userId, name, query: query as object },
  });
  return { success: true, id: saved.id };
}

export async function listSavedSearches(userId: string) {
  return prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// Scoped by `userId` in the WHERE clause itself, matching the ownership
// pattern used throughout (e.g. notifications' markAsRead).
export async function deleteSavedSearch(id: string, userId: string): Promise<boolean> {
  const result = await prisma.savedSearch.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

type MatchableListing = {
  categorySlug: string;
  governorateSlug: string | null;
  citySlug: string | null;
  price: unknown;
  searchText: string | null;
};

// A deliberately simple field-predicate match, not a re-run of the full
// PostgresSearchProvider (word_similarity ranking, GIN trigram index) —
// running that per saved search per new listing would be one live search
// query per saved search on every single listing creation. Category/
// governorate/city are matched by slug (the same identifiers RawSearchParams
// stores — see resolveSearchFilters) so this needs no per-saved-search
// database lookup, only the one listing's own slugs resolved once by the
// caller. Price is an exact range check. The free-text `q` field is a
// normalized substring check against the same `searchText` the real search
// index uses — a reasonable approximation of "does this new listing
// plausibly match," not the identical fuzzy-ranking guarantee the live
// search engine makes (it can miss what a trigram similarity match would
// still surface); documented here rather than silently assumed exact.
export function matchesListing(query: RawSearchParams, listing: MatchableListing): boolean {
  if (query.category && query.category !== listing.categorySlug) return false;
  if (query.governorate && query.governorate !== listing.governorateSlug) return false;
  if (query.city && query.city !== listing.citySlug) return false;

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const price = listing.price === null || listing.price === undefined ? null : Number(listing.price);
    if (price === null) return false;
    if (query.minPrice !== undefined && price < query.minPrice) return false;
    if (query.maxPrice !== undefined && price > query.maxPrice) return false;
  }

  if (query.q && query.q.trim()) {
    const normalizedQuery = normalizeArabicText(query.q);
    const normalizedText = normalizeArabicText(listing.searchText ?? "");
    if (!normalizedText.includes(normalizedQuery)) return false;
  }

  return true;
}

// Called from the search-indexing job (src/jobs/search-indexing.ts) once a
// new listing's searchText is available — not from createListing directly,
// so this stays off the synchronous create-listing request path, matching
// how search indexing itself is already async. One notification per
// matching user (not per matching saved search), even if several of a
// user's saved searches match the same listing — avoids spamming one user
// with near-duplicate notifications about the same listing.
export async function notifyMatchingSavedSearches(listingId: string): Promise<number> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      price: true,
      searchText: true,
      status: true,
      deletedAt: true,
      category: { select: { slug: true } },
      governorate: { select: { slug: true } },
      city: { select: { slug: true } },
    },
  });
  if (!listing || listing.deletedAt || listing.status !== "ACTIVE") return 0;

  const matchable: MatchableListing = {
    categorySlug: listing.category.slug,
    governorateSlug: listing.governorate?.slug ?? null,
    citySlug: listing.city?.slug ?? null,
    price: listing.price,
    searchText: listing.searchText,
  };

  const savedSearches = await prisma.savedSearch.findMany();
  const matchedUserIds = new Map<string, string>(); // userId -> saved search name

  for (const saved of savedSearches) {
    if (matchedUserIds.has(saved.userId)) continue;
    if (matchesListing(saved.query as RawSearchParams, matchable)) {
      matchedUserIds.set(saved.userId, saved.name);
    }
  }

  await Promise.all(
    Array.from(matchedUserIds.entries()).map(([userId, searchName]) =>
      createNotification({
        userId,
        type: "SAVED_SEARCH_MATCH",
        title: `إعلان جديد يطابق بحثك المحفوظ "${searchName}"`,
        body: listing.title,
        link: `/listings/${listing.id}`,
      }),
    ),
  );

  return matchedUserIds.size;
}
