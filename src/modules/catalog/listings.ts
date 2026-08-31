import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { FulfillmentMode } from "@prisma/client";
import { searchIndexQueue } from "@/jobs/queues";
import { resolveActiveListingLimit } from "@/modules/subscriptions/service";
import { getPlatformSettings } from "@/modules/settings/service";
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

  // Default false — a new listing publishes straight to ACTIVE unless an
  // admin has explicitly opted into mandatory pre-publish review. See
  // PlatformSettings.requirePrePublishReview and docs/DECISIONS.md.
  const settings = await getPlatformSettings();

  const result = await createListingRowAtomically(
    ownerId,
    input,
    attributeResult.data as Prisma.InputJsonValue,
    commerceEnabled,
    fulfillmentMode,
    settings.requirePrePublishReview,
  );

  if (result.success) {
    // Search indexing is queued, never computed inline on save — the
    // PostgresSearchProvider's index() fills in searchText asynchronously.
    // Enqueued after the transaction commits, never inside it (BullMQ is
    // not part of the Postgres transaction).
    await searchIndexQueue.add("index", { listingId: result.listingId });
  }

  return result;
}

// The active-listing-limit check is a count-then-create against an
// aggregate, not a single row's state transition — the
// updateMany-with-WHERE-guard pattern used elsewhere in this codebase for
// read-then-write races (checkout's listing reservation, order
// transitions) doesn't apply to an aggregate count. Serializable
// isolation makes Postgres itself detect a conflicting concurrent
// transaction (error 40001, surfaced by Prisma as P2034) rather than
// trusting an application-level guard; a single retry is standard,
// sufficient handling for an expected-to-be-rare conflict. See
// docs/DECISIONS.md.
async function createListingRowAtomically(
  ownerId: string,
  input: ListingInput,
  attributes: Prisma.InputJsonValue,
  commerceEnabled: boolean,
  fulfillmentMode: FulfillmentMode | null,
  requirePrePublishReview: boolean,
): Promise<CreateListingResult> {
  try {
    return await attemptCreateListingRow(
      ownerId,
      input,
      attributes,
      commerceEnabled,
      fulfillmentMode,
      requirePrePublishReview,
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return attemptCreateListingRow(
        ownerId,
        input,
        attributes,
        commerceEnabled,
        fulfillmentMode,
        requirePrePublishReview,
      );
    }
    throw error;
  }
}

async function attemptCreateListingRow(
  ownerId: string,
  input: ListingInput,
  attributes: Prisma.InputJsonValue,
  commerceEnabled: boolean,
  fulfillmentMode: FulfillmentMode | null,
  requirePrePublishReview: boolean,
): Promise<CreateListingResult> {
  return prisma.$transaction(
    async (tx): Promise<CreateListingResult> => {
      // Fails OPEN when unconfigured: resolveActiveListingLimit() returns
      // null both when the owner hasn't set a free-tier cap yet AND when
      // the seller's plan grants unlimited listings — either way, no cap
      // is enforced rather than inventing one. See docs/DECISIONS.md.
      const limit = await resolveActiveListingLimit(ownerId);
      if (limit !== null) {
        const activeCount = await tx.listing.count({
          where: { ownerId, status: "ACTIVE", deletedAt: null },
        });
        if (activeCount >= limit) {
          return { success: false, error: "listing_limit_reached", limit };
        }
      }

      // Publishes straight to ACTIVE by default. The pre-publish review
      // queue (flagListingForReview/decidePendingListing below) is
      // moderator-initiated off a report, not a mandatory gate — unless an
      // admin has explicitly turned on requirePrePublishReview, in which
      // case every new listing starts at PENDING_REVIEW instead. Either
      // way expiresAt is set immediately, at the same value/timing: a
      // PENDING_REVIEW listing approved later via decidePendingListing
      // needs no separate expiresAt-setting logic there, since it already
      // has one from the moment it was created.
      const listing = await tx.listing.create({
        data: {
          ownerId,
          categoryId: input.categoryId,
          title: input.title,
          description: input.description,
          price: input.price,
          negotiable: input.negotiable ?? false,
          governorateId: input.governorateId,
          cityId: input.cityId,
          attributes,
          commerceEnabled,
          fulfillmentMode,
          status: requirePrePublishReview ? "PENDING_REVIEW" : "ACTIVE",
          expiresAt: new Date(Date.now() + LISTING_LIFETIME_MS),
        },
      });

      return { success: true, listingId: listing.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
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

// Statuses visible to a non-owner viewer. DRAFT/PENDING_REVIEW/REJECTED
// are deliberately excluded — a listing under moderation or never
// published shouldn't be fetchable by anyone who happens to know its ID.
// REMOVED listings are already excluded via `deletedAt`, set alongside
// that status by adminRemoveListing.
const PUBLICLY_VISIBLE_STATUSES = ["ACTIVE", "SOLD", "EXPIRED"];

// A moderator/admin can view any non-deleted listing regardless of status —
// they need to see PENDING_REVIEW/REJECTED/DRAFT content to actually
// moderate it, not just the publicly-visible subset.
export async function getListingById(id: string, viewerId?: string, viewerRole?: string) {
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: {
      images: { where: { status: "READY" }, orderBy: { sortOrder: "asc" } },
      category: { include: { attributes: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } } },
      governorate: true,
      city: true,
      owner: { select: { id: true, name: true, phone: true, commerceVerifiedAt: true } },
    },
  });
  if (!listing) return null;
  const isPrivileged = viewerRole === "MODERATOR" || viewerRole === "ADMIN";
  if (listing.ownerId !== viewerId && !isPrivileged && !PUBLICLY_VISIBLE_STATUSES.includes(listing.status)) {
    return null;
  }
  return listing;
}

const OWNER_LISTINGS_DEFAULT_LIMIT = 20;
const OWNER_LISTINGS_MAX_LIMIT = 100;

export interface ListListingsByOwnerFilter {
  page?: number;
  limit?: number;
}

export async function listListingsByOwner(ownerId: string, filter: ListListingsByOwnerFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || OWNER_LISTINGS_DEFAULT_LIMIT, 1), OWNER_LISTINGS_MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { ownerId, deletedAt: null };

  const [items, totalCount] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.listing.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
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

// Moderator-initiated removal — deliberately not scoped by `ownerId` (the
// caller isn't the owner), kept as its own explicit function rather than an
// `isAdmin` branch on `softDeleteListing` so the authority behind each call
// site stays visible at a glance.
export async function adminRemoveListing(listingId: string): Promise<boolean> {
  const result = await prisma.listing.updateMany({
    where: { id: listingId, deletedAt: null },
    data: { deletedAt: new Date(), status: "REMOVED" },
  });
  return result.count > 0;
}

// Moderator-initiated soft escalation — a reviewable alternative to
// adminRemoveListing for an ambiguous report: the listing is hidden from
// search/public view (see PUBLICLY_VISIBLE_STATUSES above) but not soft-
// deleted, so it can be restored to ACTIVE without the seller re-creating
// it. Only applies from ACTIVE — flagging an already-sold/expired/removed
// listing isn't a meaningful transition.
export async function flagListingForReview(listingId: string): Promise<boolean> {
  const result = await prisma.listing.updateMany({
    where: { id: listingId, deletedAt: null, status: "ACTIVE" },
    data: { status: "PENDING_REVIEW" },
  });
  return result.count > 0;
}

export interface PendingReviewListingsFilter {
  page?: number;
  limit?: number;
}

const PENDING_REVIEW_DEFAULT_LIMIT = 20;
const PENDING_REVIEW_MAX_LIMIT = 100;

// The moderation queue for flagListingForReview's output — mirrors
// listReports' pagination shape.
export async function listPendingReviewListings(filter: PendingReviewListingsFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || PENDING_REVIEW_DEFAULT_LIMIT, 1), PENDING_REVIEW_MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where: Prisma.ListingWhereInput = { status: "PENDING_REVIEW", deletedAt: null };

  const [items, totalCount] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

// Resolves a pending-review listing one way or the other. Returns the
// listing's id/ownerId/title (for the caller to notify the seller) or null
// if it wasn't actually PENDING_REVIEW — same "fetch then act" shape as
// resolveReport, so a stale/already-decided listing fails loudly instead of
// silently no-op'ing.
export async function decidePendingListing(
  listingId: string,
  decision: "APPROVE" | "REJECT",
): Promise<{ id: string; ownerId: string; title: string } | null> {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, deletedAt: null, status: "PENDING_REVIEW" },
    select: { id: true, ownerId: true, title: true },
  });
  if (!listing) return null;

  await prisma.listing.update({
    where: { id: listingId },
    data: { status: decision === "APPROVE" ? "ACTIVE" : "REJECTED" },
  });

  return listing;
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
