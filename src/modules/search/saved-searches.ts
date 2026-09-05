import { Prisma } from "@prisma/client";
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

// Atomically claims the right to notify `userId` about `listingId`.
// Returns true if this call won the claim (no prior record existed),
// false if already claimed (a prior run of this job — e.g. a listing
// edit re-triggering re-indexing — or a concurrent overlapping job for
// the same listing). Keyed by (userId, listingId) only — never
// savedSearchId — see docs/DECISIONS.md for why: deleteSavedSearch fully
// removes a SavedSearch row, and a savedSearchId-keyed claim would
// disappear with it, letting a still-matching different saved search
// re-notify the same user about a listing they were already told about.
async function claimSavedSearchNotification(userId: string, listingId: string): Promise<boolean> {
  try {
    await prisma.savedSearchNotification.create({ data: { userId, listingId } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

// A generous technical default, not a business decision — bounds how many
// SavedSearch rows are held in memory at once (see the drain loop below),
// not how many total rows can ever be scanned. Overridable per-call only
// for tests, which use a tiny value to exercise the multi-page path
// without needing hundreds of real rows.
const SAVED_SEARCH_BATCH_SIZE = 500;

// Called from the search-indexing job (src/jobs/search-indexing.ts) once a
// new listing's searchText is available — not from createListing directly,
// so this stays off the synchronous create-listing request path, matching
// how search indexing itself is already async. This job also re-runs on
// every listing edit (title/description change re-queues indexing), so
// every matching user is claimed via SavedSearchNotification before being
// notified — one notification per matching user per listing, ever, not
// just "per matching saved search" within a single call.
export async function notifyMatchingSavedSearches(
  listingId: string,
  batchSize: number = SAVED_SEARCH_BATCH_SIZE,
): Promise<number> {
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

  // Drains the entire SavedSearch table in bounded pages instead of one
  // unbounded findMany() — this table has no index usable for filtering by
  // listing attributes (query is a plain, unindexed Json column, and every
  // field within it is optional — a missing filter matches everything, so
  // it can't be pushed into a SQL WHERE without a JSON-path rewrite that
  // has no precedent in this codebase and no current-scale evidence it's
  // needed; see docs/DECISIONS.md). Cursor-paginating on `id` bounds memory
  // to one batch at a time regardless of table size, matching this
  // codebase's own "every list query must be bounded" convention.
  const matchedUserIds = new Map<string, string>(); // userId -> saved search name
  let cursorId: string | undefined;
  for (;;) {
    const batch = await prisma.savedSearch.findMany({
      take: batchSize,
      orderBy: { id: "asc" },
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
    });
    if (batch.length === 0) break;

    for (const saved of batch) {
      if (matchedUserIds.has(saved.userId)) continue;
      if (matchesListing(saved.query as RawSearchParams, matchable)) {
        matchedUserIds.set(saved.userId, saved.name);
      }
    }

    cursorId = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  const claims = await Promise.all(
    Array.from(matchedUserIds.entries()).map(async ([userId, searchName]) => {
      const claimed = await claimSavedSearchNotification(userId, listing.id);
      return claimed ? { userId, searchName } : null;
    }),
  );
  const toNotify = claims.filter((c): c is { userId: string; searchName: string } => c !== null);

  await Promise.all(
    toNotify.map(({ userId, searchName }) =>
      createNotification({
        userId,
        type: "SAVED_SEARCH_MATCH",
        title: `إعلان جديد يطابق بحثك المحفوظ "${searchName}"`,
        body: listing.title,
        link: `/listings/${listing.id}`,
      }),
    ),
  );

  return toNotify.length;
}
