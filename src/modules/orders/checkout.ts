import { prisma } from "@/lib/db";
import type { FulfillmentMode } from "@prisma/client";
import { resolveShippingFee, computeShippingCommission } from "@/modules/shipping/service";
import { getPaymentProvider, isOnlinePaymentConfigured } from "@/modules/payments/service";

export interface CheckoutInput {
  listingId: string;
  paymentMethod?: "CASH_ON_DELIVERY" | "ONLINE";
  shippingCompanyId?: string;
  shippingAddress?: unknown;
  buyerNote?: string;
}

export type CheckoutResult =
  | { success: true; orderId: string; redirectUrl?: string }
  | {
      success: false;
      error:
        | "listing_not_found"
        | "not_checkout_enabled"
        | "cannot_buy_own_listing"
        | "price_not_set"
        | "shipping_company_required"
        | "shipping_rate_unavailable"
        | "payment_method_unavailable";
    };

// Every money field on the resulting Order is snapshotted here, at
// checkout time, from whatever's in effect right now — never re-read live
// later. See Order's fields in prisma/schema.prisma for why.
export async function createOrder(buyerId: string, input: CheckoutInput): Promise<CheckoutResult> {
  const listing = await prisma.listing.findFirst({
    where: { id: input.listingId, deletedAt: null, status: "ACTIVE" },
  });
  if (!listing) return { success: false, error: "listing_not_found" };
  if (!listing.commerceEnabled || !listing.fulfillmentMode) {
    return { success: false, error: "not_checkout_enabled" };
  }
  if (listing.ownerId === buyerId) return { success: false, error: "cannot_buy_own_listing" };
  if (listing.price === null) return { success: false, error: "price_not_set" };

  const paymentMethod = input.paymentMethod ?? "CASH_ON_DELIVERY";
  if (paymentMethod === "ONLINE" && !isOnlinePaymentConfigured()) {
    return { success: false, error: "payment_method_unavailable" };
  }

  const productPrice = Number(listing.price);
  let shippingFee: number | null = null;
  let shippingCommissionAmount: number | null = null;
  let shippingCompanyId: string | null = null;

  if (listing.fulfillmentMode === "PLATFORM_SHIPPING") {
    if (!input.shippingCompanyId) return { success: false, error: "shipping_company_required" };

    const address = input.shippingAddress as { governorateId?: string } | undefined;
    const fee = await resolveShippingFee(input.shippingCompanyId, address?.governorateId ?? null);
    if (fee === null) return { success: false, error: "shipping_rate_unavailable" };

    shippingCompanyId = input.shippingCompanyId;
    shippingFee = fee;
    shippingCommissionAmount = await computeShippingCommission(input.shippingCompanyId, fee);
  }

  const totalAmount = productPrice + (shippingFee ?? 0);

  const order = await prisma.order.create({
    data: {
      buyerId,
      sellerId: listing.ownerId,
      listingId: listing.id,
      fulfillmentMode: listing.fulfillmentMode as FulfillmentMode,
      productPrice,
      currency: listing.currency,
      shippingCompanyId,
      shippingFee,
      shippingCommissionAmount,
      totalAmount,
      paymentMethod,
      shippingAddress: input.shippingAddress as never,
      buyerNote: input.buyerNote,
    },
  });

  // Reserve the listing immediately so it can't be sold to two buyers at
  // once — reversed back to ACTIVE if this order is later cancelled (see
  // transitions.ts).
  await prisma.listing.update({ where: { id: listing.id }, data: { status: "SOLD" } });

  const payment = await getPaymentProvider(paymentMethod).createPayment({
    orderId: order.id,
    totalAmount,
    currency: listing.currency,
  });

  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: payment.paymentStatus } });

  return { success: true, orderId: order.id, redirectUrl: payment.redirectUrl };
}
