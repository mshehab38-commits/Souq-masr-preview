import { getSearchProvider, notifyMatchingSavedSearches } from "@/modules/search/service";

export interface SearchIndexJobData {
  listingId: string;
}

export async function indexListingJob(data: SearchIndexJobData): Promise<void> {
  await getSearchProvider().index(data.listingId);
  // Runs after indexing, not before: notifyMatchingSavedSearches reads the
  // listing's searchText for its free-text match check, which index()
  // above is what populates.
  await notifyMatchingSavedSearches(data.listingId);
}
