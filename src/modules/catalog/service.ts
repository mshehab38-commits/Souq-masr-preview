import { prisma } from "@/lib/db";

export async function getCategories() {
  return prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { attributes: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
}

export async function getGovernorates() {
  return prisma.governorate.findMany({
    orderBy: { nameAr: "asc" },
    include: { cities: { orderBy: { nameAr: "asc" } } },
  });
}

export { resolveCommerceEligibility } from "./commerceEligibility";
export { validateListingAttributes } from "./attributes";
export { normalizeArabicText, buildSearchText } from "./search-text";
export {
  createListing,
  updateListing,
  getListingById,
  listListingsByOwner,
  softDeleteListing,
  adminRemoveListing,
  flagListingForReview,
  listPendingReviewListings,
  decidePendingListing,
  markListingAsSold,
  incrementListingViewCount,
  bulkUpdateListings,
  renewListing,
  getSellerStats,
  LISTING_LIFETIME_MS,
} from "./listings";
export type {
  ListingInput,
  CreateListingResult,
  UpdateListingResult,
  BulkListingAction,
  BulkActionResult,
  RenewListingResult,
  SellerStats,
  PendingReviewListingsFilter,
} from "./listings";
export {
  requestImageUploadTarget,
  confirmImageUpload,
  deleteListingImage,
} from "./images";
export { toggleFavorite, listFavoriteListings } from "./favorites";
