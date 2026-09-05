import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { listActiveListingIdsForSitemap } from "@/modules/catalog/service";
import { listStoreSlugsForSitemap } from "@/modules/store/service";

// Without a revalidate window this route has no dynamic API calls, so
// Next.js would generate it once at build time and never again — new
// listings/stores would be invisible to crawlers until the next deploy.
// Hourly matches this project's existing revalidate convention
// (src/app/page.tsx's homepage) for a similarly read-heavy, frequently
// changing public page.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, stores] = await Promise.all([
    listActiveListingIdsForSitemap(),
    listStoreSlugsForSitemap(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: env.APP_URL, changeFrequency: "daily", priority: 1 },
    { url: `${env.APP_URL}/search`, changeFrequency: "daily", priority: 0.8 },
    { url: `${env.APP_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const listingEntries: MetadataRoute.Sitemap = listings.map((listing) => ({
    url: `${env.APP_URL}/listings/${listing.id}`,
    lastModified: listing.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const storeEntries: MetadataRoute.Sitemap = stores.map((store) => ({
    url: `${env.APP_URL}/store/${store.slug}`,
    lastModified: store.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticEntries, ...listingEntries, ...storeEntries];
}
