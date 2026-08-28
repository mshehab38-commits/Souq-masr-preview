import { prisma } from "@/lib/db";
import type { SearchFilters, SortOption } from "./types";

export interface RawSearchParams {
  q?: string;
  category?: string;
  governorate?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortOption;
}

// Shared by the /api/search route and the server-rendered search page so
// slug-to-id resolution never drifts between the two call sites.
export async function resolveSearchFilters(raw: RawSearchParams): Promise<SearchFilters> {
  const [categoryRow, governorateRow] = await Promise.all([
    raw.category ? prisma.category.findUnique({ where: { slug: raw.category } }) : Promise.resolve(null),
    raw.governorate ? prisma.governorate.findUnique({ where: { slug: raw.governorate } }) : Promise.resolve(null),
  ]);
  const cityRow = raw.city
    ? await prisma.city.findFirst({
        where: { slug: raw.city, ...(governorateRow ? { governorateId: governorateRow.id } : {}) },
      })
    : null;

  return {
    query: raw.q,
    categoryId: categoryRow?.id,
    governorateId: governorateRow?.id,
    cityId: cityRow?.id,
    minPrice: raw.minPrice,
    maxPrice: raw.maxPrice,
    sort: raw.sort,
  };
}
