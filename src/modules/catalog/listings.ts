import { prisma } from "@/lib/db";
import type { FulfillmentMode, Prisma } from "@prisma/client";
import { searchIndexQueue } from "@/jobs/queues";
import { resolveActiveListingLimit } from "@/modules/subscriptions/service";
import { resolveCommerceEligibility } from "./commerceEligibility";
import { validateListingAttributes } from "./attributes";

// How long a newly (re)published listing stays ACTIVE before the expiry
// sweep (src/jobs/listing-expiry.ts) marks it EXPIRED. Not a business/pricing
// decision — a technical default for keeping stale inventory out of search;
// revisit only if the owner wants seller-facing control over it later.
export const LISTING_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export interface ListingInput {
  categoryId: string;
  title: string;
  description?: string;
  price?: number;
  negotiable?: boolean;
  governorateId?: string;
  cityId?: string;
  attributes?: unknown;
  commerceEnabled?: boolean;
  fulfillmentMode?: FulfillmentMode;
}

export type CreateListingResult =
  | { success: true; listingId: string }
  | { success: false; error: "invalid_attributes"; details: string[] }
  | { success: false; error: "commerce_not_allowed"; reason: string }
  | { success: false; error: "listing_limit_reached"; limit: number };

export async function createListing(
  ownerId: string,
  input: ListingInput,
): Promise<CreateListingResult> {
  // Fails OPEN when unconfigured: resolveActiveListingLimit() returns null
  // both when the owner hasn't set a free-tier cap yet AND when the
  // seller's plan grants unlimited listings — either way, no cap is
  // enforced rather than inventing one. See docs/DECISIONS.md.
  const limit = await resolveActiveListingLimit(ownerId);
  if (limit !== null) {
    const activeCount = await prisma.listing.count({
      where: { ownerId, status: "ACTIVE", deletedAt: null },
    });
    if (activeCount >= limit) {
      return { success: false, error: "listing_limit_reached", limit };
    }
  }

  const attributeResult = await validateListingAttributes(input.categoryId, input.attributes);
  if (!attributeResult.success) {
    return { success: false, error: "invalid_attributes", details: attributeResult.errors ?? [] };
  }

  let commerceEnabled = false;
  let fulfillmentMode: FulfillmentMode | null = null;

  if (input.commerceEnabled) {
    const eligibility = await resolveCommerceEligibility(ownerId, input.categoryId);
    if (!eligibility.eligible) {
      return { success: false, error: "commerce_not_allowed", reason: eligibility.reason };
    }
    if (!input.fulfillmentMode || !eligibility.allowedFulfillmentModes.includes(input.fulfillmentMode)) {
      return { success: false, error: "commerce_not_allowed", reason: "invalid_fulfillment_mode" };
    }
    commerceEnabled = true;
    fulfillmentMode = input.fulfillmentMode;
  }

  // No moderation queue exists yet (Phase 9 adds it, with an async
  // pending-review state for flagged content) — listings publish immediately.
  const listing = await prisma.listing.create({
    data: {
      ownerId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      price: input.price,
      negotiable: input.negotiable ?? false,
      governorateId: input.governorateId,
      cityId: input.cityId,
      attributes: attributeResult.data as Prisma.InputJsonValue,
      commerceEnabled,
      fulfillmentMode,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + LISTING_LIFETIME_MS),
    },
  });

  // Search indexing is queued, never computed inline on save — the
  // PostgresSearchProvider's index() fills in searchText asynchronously.
  await searchIndexQueue.add("index", { listingId: listing.id });

  return { success: true, listingId: listing.id };
}

export type UpdateListingResult =
  | { success: true }
  | { success: false; error: "not_found" | "forbidden" | "invalid_attributes"; details?: string[] };

export async function updateListing(
  listingId: string,
  ownerId: string,
  input: Partial<ListingInput>,
): Promise<UpdateListingResult> {
  const existing = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
  if (!existing) return { success: false, error: "not_found" };
  if (existing.ownerId !== ownerId) return { success: false, error: "forbidden" };

  const categoryId = input.categoryId ?? existing.categoryId;
  let attributesData: Prisma.InputJsonValue | undefined;
  if (input.attributes !== undefined) {
    const result = await validateListingAttributes(categoryId, input.attributes);
    if (!result.success) {
      return { success: false, error: "invalid_attributes", details: result.errors };
    }
    attributesData = result.data as Prisma.InputJsonValue;
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      title: input.title,
      description: input.description,
      price: input.price,
      negotiable: input.negotiable,
      governorateId: input.governorateId,
      cityId: input.cityId,
      attributes: attributesData,
    },
  });

  if (input.title !== undefined || input.description !== undefined) {
    await searchIndexQueue.add("index", { listingId });
  }

  return { success: true };
}

export async function getListingById(id: string) {
  return prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: {
      images: { where: { status: "READY" }, orderBy: { sortOrder: "asc" } },
      category: { include: { attributes: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } } },
      governorate: true,
      city: true,
      owner: { select: { id: true, name: true, phone: true, commerceVerifiedAt: true } },
    },
  });
}

export async function listListingsByOwner(ownerId: string) {
  return prisma.listing.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
}

export interface SellerStats {
  activeCount: number;
  soldCount: number;
  expiredCount: number;
  totalViews: number;
  favoritesReceived: number;
}

export async function getSellerStats(ownerId: string): Promise<SellerStats> {
  const [statusCounts, viewAggregate, favoritesReceived] = await Promise.all([
    prisma.listing.groupBy({
      by: ["status"],
      where: { ownerId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.listing.aggregate({
      where: { ownerId, deletedAt: null },
      _sum: { viewCount: true },
    }),
    prisma.favorite.count({ where: { listing: { ownerId, deletedAt: null } } }),
  ]);

  const countFor = (status: string) =>
    statusCounts.find((row) => row.status === status)?._count._all ?? 0;

  return {
    activeCount: countFor("ACTIVE"),
    soldCount: countFor("SOLD"),
    expiredCount: countFor("EXPIRED"),
    totalViews: viewAggregate._sum.viewCount ?? 0,
    favoritesReceived,
  };
}

export async function softDeleteListing(listingId: string, ownerId: string): Promise<boolean> {
  const result = await prisma.listing.updateMany({
    where: { id: listingId, ownerId, deletedAt: null },
    data: { deletedAt: new Date(), status: "REMOVED" },
  });
  return result.count > 0;
}

export async function markListingAsSold(listingId: string, ownerId: string): Promise<boolean> {
  const result = await prisma.listing.updateMany({
    where: { id: listingId, ownerId, deletedAt: null },
    data: { status: "SOLD" },
  });
  return result.count > 0;
}

export async function incrementListingViewCount(listingId: string): Promise<void> {
  await prisma.listing
    .update({ where: { id: listingId }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
}

export type BulkListingAction = "mark_sold" | "delete" | "relist";

export interface BulkActionResult {
  requested: number;
  affected: number;
}

// Every action is scoped to `ownerId` in the WHERE clause itself (not
// checked per-row after fetching) so a caller can never affect another
// seller's listings by passing IDs they don't own — those IDs are simply
// excluded from `affected` rather than causing an error.
export async function bulkUpdateListings(
  ownerId: string,
  listingIds: string[],
  action: BulkListingAction,
): Promise<BulkActionResult> {
  const where = { id: { in: listingIds }, ownerId, deletedAt: null };

  if (action === "mark_sold") {
    const result = await prisma.listing.updateMany({ where, data: { status: "SOLD" } });
    return { requested: listingIds.length, affected: result.count };
  }

  if (action === "delete") {
    const result = await prisma.listing.updateMany({
      where,
      data: { deletedAt: new Date(), status: "REMOVED" },
    });
    return { requested: listingIds.length, affected: result.count };
  }

  // relist: only makes sense for listings not currently ACTIVE (SOLD/EXPIRED)
  const result = await prisma.listing.updateMany({
    where: { ...where, status: { in: ["SOLD", "EXPIRED"] } },
    data: { status: "ACTIVE", expiresAt: new Date(Date.now() + LISTING_LIFETIME_MS) },
  });
  return { requested: listingIds.length, affected: result.count };
}

export type RenewListingResult =
  | { success: true }
  | { success: false; error: "not_found" };

export async function renewListing(listingId: string, ownerId: string): Promise<RenewListingResult> {
  const result = await prisma.listing.updateMany({
    where: { id: listingId, ownerId, deletedAt: null, status: { in: ["ACTIVE", "EXPIRED"] } },
    data: { status: "ACTIVE", expiresAt: new Date(Date.now() + LISTING_LIFETIME_MS) },
  });
  if (result.count === 0) return { success: false, error: "not_found" };
  return { success: true };
}
