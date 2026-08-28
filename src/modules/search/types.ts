export type SortOption = "newest" | "price_asc" | "price_desc" | "relevance";

export interface SearchFilters {
  query?: string;
  categoryId?: string;
  governorateId?: string;
  cityId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortOption;
}

export interface SearchPage {
  page: number;
  limit: number;
}

export interface SearchResultItem {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  negotiable: boolean;
  thumbnailUrl: string | null;
  governorateName: string | null;
  cityName: string | null;
  createdAt: string;
}

export interface SearchResult {
  items: SearchResultItem[];
  page: number;
  totalPages: number;
  totalCount: number;
}

// Page-based, not cursor-based: search is a ranked-results view (consistent
// with the Pagination UI component from Phase 1B), not an infinite-scroll
// feed — cursor pagination is reserved for feed-style collections
// (messages, notifications) in later phases.
export interface SearchProvider {
  search(filters: SearchFilters, pagination: SearchPage): Promise<SearchResult>;
  index(listingId: string): Promise<void>;
  remove(listingId: string): Promise<void>;
}
