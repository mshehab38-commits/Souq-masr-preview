import { prisma } from "@/lib/db";
import type { FulfillmentMode } from "@prisma/client";
import { resolveShippingFee, computeShippingCommission } from "@/modules/shipping/service";
import { getPaymentProvider, isOnlinePaymentConfigured } from "@/modules/payments/service";
import { createNotification } from "@/modules/notifications/service";

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
        | "payment_method_unavailable"
        | "listing_already_sold";
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

  // Reserve the listing and create the order atomically, in one
  // transaction: the updateMany's `status: "ACTIVE"` guard is the actual
  // concurrency control — two simultaneous checkouts on the same listing
  // can both pass the findFirst check above, but only one can win this
  // conditional update (Postgres serializes concurrent UPDATEs on the
  // same row; the second one's WHERE no longer matches once the first
  // commits). Wrapping the reservation and the order.create in the same
  // transaction means a failure creating the order (rare, but possible)
  // rolls the reservation back too, rather than leaving the listing
  // stuck at SOLD with no order to show for it. Reversed back to ACTIVE
  // if this order is later cancelled (see transitions.ts).
  const order = await prisma.$transaction(async (tx) => {
    const reservation = await tx.listing.updateMany({
      where: { id: listing.id, status: "ACTIVE" },
      data: { status: "SOLD" },
    });
    if (reservation.count === 0) return null;

    return tx.order.create({
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
  });

  if (!order) return { success: false, error: "listing_already_sold" };

  const payment = await getPaymentProvider(paymentMethod).createPayment({
    orderId: order.id,
    totalAmount,
    currency: listing.currency,
  });

  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: payment.paymentStatus } });

  await createNotification({
    userId: listing.ownerId,
    type: "NEW_ORDER",
    title: "لديك طلب جديد",
    body: `طلب جديد على إعلان "${listing.title}"`,
    link: `/orders/${order.id}`,
  });

  return { success: true, orderId: order.id, redirectUrl: payment.redirectUrl };
}
