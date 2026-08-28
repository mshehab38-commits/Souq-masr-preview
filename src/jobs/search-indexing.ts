import { getSearchProvider } from "@/modules/search/service";

export interface SearchIndexJobData {
  listingId: string;
}

export async function indexListingJob(data: SearchIndexJobData): Promise<void> {
  await getSearchProvider().index(data.listingId);
}
