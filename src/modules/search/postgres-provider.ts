import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeArabicText, buildSearchText } from "@/modules/catalog/service";
import type { SearchFilters, SearchPage, SearchProvider, SearchResult, SearchResultItem } from "./types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type ListingWithRelations = Prisma.ListingGetPayload<{
  include: {
    images: true;
    governorate: true;
    city: true;
  };
}>;

function mapItem(listing: ListingWithRelations): SearchResultItem {
  const thumbnail = listing.images.find((image) => image.status === "READY");
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price ? Number(listing.price) : null,
    currency: listing.currency,
    negotiable: listing.negotiable,
    thumbnailUrl: thumbnail?.thumbnailUrl ?? null,
    governorateName: listing.governorate?.nameAr ?? null,
    cityName: listing.city?.nameAr ?? null,
    createdAt: listing.createdAt.toISOString(),
  };
}

function buildFilterConditions(filters: SearchFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`"status" = 'ACTIVE'`,
  ];
  if (filters.categoryId) conditions.push(Prisma.sql`"categoryId" = ${filters.categoryId}`);
  if (filters.governorateId) conditions.push(Prisma.sql`"governorateId" = ${filters.governorateId}`);
  if (filters.cityId) conditions.push(Prisma.sql`"cityId" = ${filters.cityId}`);
  if (filters.minPrice !== undefined) conditions.push(Prisma.sql`"price" >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined) conditions.push(Prisma.sql`"price" <= ${filters.maxPrice}`);
  return conditions;
}

function buildWhere(filters: SearchFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = { deletedAt: null, status: "ACTIVE" };
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.governorateId) where.governorateId = filters.governorateId;
  if (filters.cityId) where.cityId = filters.cityId;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.price = { gte: filters.minPrice, lte: filters.maxPrice };
  }
  return where;
}

function orderByFor(sort: SearchFilters["sort"]): Prisma.ListingOrderByWithRelationInput[] {
  if (sort === "price_asc") return [{ price: "asc" }, { id: "desc" }];
  if (sort === "price_desc") return [{ price: "desc" }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

const RESULT_INCLUDE = { images: true, governorate: true, city: true } satisfies Prisma.ListingInclude;

export class PostgresSearchProvider implements SearchProvider {
  async search(filters: SearchFilters, pagination: SearchPage): Promise<SearchResult> {
    const limit = Math.min(Math.max(pagination.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(pagination.page || 1, 1);

    if (filters.query && filters.query.trim().length > 0) {
      return this.searchWithQuery(filters, page, limit);
    }

    const where = buildWhere(filters);
    const [listings, totalCount] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy: orderByFor(filters.sort),
        skip: (page - 1) * limit,
        take: limit,
        include: RESULT_INCLUDE,
      }),
      prisma.listing.count({ where }),
    ]);

    return {
      items: listings.map(mapItem),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    };
  }

  private async searchWithQuery(filters: SearchFilters, page: number, limit: number): Promise<SearchResult> {
    const normalizedQuery = normalizeArabicText(filters.query ?? "");
    const conditions = buildFilterConditions(filters);
    // pg_trgm's word_similarity/`<%` finds the best-matching *substring* of
    // searchText for the query — unlike plain similarity()/`%`, which scores
    // the query against the whole (much longer) field and under-matches a
    // short query against a long title+description blob. This is what
    // actually gives typo-tolerant "found somewhere in this listing" search.
    conditions.push(Prisma.sql`${normalizedQuery} <% "searchText"`);
    const whereClause = Prisma.join(conditions, " AND ");
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM listings
        WHERE ${whereClause}
        ORDER BY word_similarity(${normalizedQuery}, "searchText") DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM listings WHERE ${whereClause}
      `,
    ]);

    const orderedIds = rows.map((row) => row.id);
    const listings = await prisma.listing.findMany({
      where: { id: { in: orderedIds } },
      include: RESULT_INCLUDE,
    });
    const byId = new Map(listings.map((listing) => [listing.id, listing]));
    const ordered = orderedIds.map((id) => byId.get(id)).filter((l): l is ListingWithRelations => Boolean(l));

    const totalCount = Number(countRows[0]?.count ?? 0);
    return {
      items: ordered.map(mapItem),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    };
  }

  async index(listingId: string): Promise<void> {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return;
    await prisma.listing.update({
      where: { id: listingId },
      data: { searchText: buildSearchText(listing.title, listing.description) },
    });
  }

  async remove(): Promise<void> {
    // No separate index to remove from — soft-deleted/removed listings are
    // already excluded by the `status`/`deletedAt` filter on every query.
  }
}
