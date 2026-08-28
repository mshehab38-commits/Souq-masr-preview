import { prisma } from "@/lib/db";
import type { FulfillmentMode, Prisma } from "@prisma/client";
import { searchIndexQueue } from "@/jobs/queues";
import { resolveCommerceEligibility } from "./commerceEligibility";
import { validateListingAttributes } from "./attributes";

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
  | { success: false; error: "commerce_not_allowed"; reason: string };

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
