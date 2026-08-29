import { PostgresSearchProvider } from "./postgres-provider";
import type { SearchProvider } from "./types";

export type { SearchFilters, SearchPage, SearchResult, SearchResultItem, SortOption } from "./types";
export { resolveSearchFilters } from "./query-params";
export type { RawSearchParams } from "./query-params";
export {
  createSavedSearch,
  listSavedSearches,
  deleteSavedSearch,
  matchesListing,
  notifyMatchingSavedSearches,
} from "./saved-searches";
export type { CreateSavedSearchResult } from "./saved-searches";

let cached: SearchProvider | null = null;

// Postgres (FTS + pg_trgm) today; an OpenSearch/Typesense adapter can be
// swapped in here later behind the same SearchProvider interface with zero
// changes to any caller.
export function getSearchProvider(): SearchProvider {
  if (!cached) {
    cached = new PostgresSearchProvider();
  }
  return cached;
}
