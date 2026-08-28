import { prisma } from "@/lib/db";
import type { FulfillmentMode } from "@prisma/client";

export type CommerceEligibilityResult =
  | { eligible: true; allowedFulfillmentModes: FulfillmentMode[] }
  | { eligible: false; reason: "category_not_found" | "category_not_eligible" | "seller_not_verified" };

const ALL_FULFILLMENT_MODES: FulfillmentMode[] = ["SELF_ARRANGED", "PLATFORM_SHIPPING", "SELLER_DELIVERY"];

// Resolved server-side only, at both listing-save and checkout time — never
// decided by the frontend. Category sets a *default*, not a lock; a
// per-category/per-seller admin override table lands in Phase 10 on top of
// this (there are no overrides to consult yet, so the category default is
// authoritative for now).
export async function resolveCommerceEligibility(
  sellerId: string,
  categoryId: string,
): Promise<CommerceEligibilityResult> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || category.deletedAt) {
    return { eligible: false, reason: "category_not_found" };
  }

  // ADMIN_REVIEW categories are eligible only once an admin has explicitly
  // approved them (Phase 10 admin UI) — treated as not-eligible until then.
  if (category.commerceDefault !== "ELIGIBLE") {
    return { eligible: false, reason: "category_not_eligible" };
  }

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  const sellerVerified =
    seller && !seller.deletedAt && seller.status === "ACTIVE" && seller.commerceVerifiedAt !== null;
  if (!sellerVerified) {
    return { eligible: false, reason: "seller_not_verified" };
  }

  return { eligible: true, allowedFulfillmentModes: ALL_FULFILLMENT_MODES };
}
