import { prisma } from "@/lib/db";
import type { OrderStatus } from "@prisma/client";
import { LISTING_LIFETIME_MS } from "@/modules/catalog/service";
import { recordLedgerEntry } from "@/modules/ledger/service";
import { canTransition, isTerminalStatus, type OrderActor } from "./state-machine";

export function resolveActor(
  order: { buyerId: string; sellerId: string },
  userId: string,
  isAdmin: boolean,
): OrderActor | null {
  if (isAdmin) return "ADMIN";
  if (order.buyerId === userId) return "BUYER";
  if (order.sellerId === userId) return "SELLER";
  return null;
}

export type TransitionResult =
  | { success: true }
  | { success: false; error: "not_found" | "forbidden" | "invalid_transition" };

export interface TransitionInput {
  targetStatus: OrderStatus;
  cancelReason?: string;
}

export async function transitionOrder(
  orderId: string,
  userId: string,
  isAdmin: boolean,
  input: TransitionInput,
): Promise<TransitionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "not_found" };

  const actor = resolveActor(order, userId, isAdmin);
  if (!actor) return { success: false, error: "forbidden" };

  if (isTerminalStatus(order.status)) return { success: false, error: "invalid_transition" };
  if (!canTransition(order.status, input.targetStatus, actor)) {
    return { success: false, error: "invalid_transition" };
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: input.targetStatus };

  if (input.targetStatus === "CONFIRMED") data.confirmedAt = now;
  if (input.targetStatus === "DELIVERED") data.deliveredAt = now;
  if (input.targetStatus === "COMPLETED") data.completedAt = now;
  if (input.targetStatus === "CANCELLED") {
    data.cancelledAt = now;
    data.cancelledBy = actor === "SYSTEM" ? "SYSTEM" : actor;
    data.cancelReason = input.cancelReason;
  }

  await prisma.order.update({ where: { id: orderId }, data });

  // Cancelling releases the reservation placed at checkout time (see
  // checkout.ts) — the listing goes back on the market with a fresh
  // expiry, exactly like a manual relist.
  if (input.targetStatus === "CANCELLED" || input.targetStatus === "FAILED") {
    await prisma.listing.updateMany({
      where: { id: order.listingId, status: "SOLD" },
      data: { status: "ACTIVE", expiresAt: new Date(Date.now() + LISTING_LIFETIME_MS) },
    });
  }

  if (input.targetStatus === "COMPLETED") {
    await recordCompletionFinancials(order.id, order.sellerId, Number(order.productPrice), order.paymentMethod);
  }

  return { success: true };
}

// Zero commission on the product sale, per the approved business model:
// SellerPayout.amount is always the full productPrice. For cash-on-delivery
// orders — the only live payment method today — the buyer already paid the
// seller directly, so no ledger entry or payout row is created: Souq Masr
// never held that money and has nothing to disburse or report as a
// liability. Once a live online provider exists, this branch creates the
// real payable/payout pair.
async function recordCompletionFinancials(
  orderId: string,
  sellerId: string,
  productPrice: number,
  paymentMethod: string,
): Promise<void> {
  if (paymentMethod !== "ONLINE") return;

  await recordLedgerEntry({
    type: "SELLER_PAYOUT",
    account: "SELLER_PAYABLE",
    amount: productPrice,
    orderId,
    description: "Full product price owed to seller — zero platform commission",
  });

  await prisma.sellerPayout.create({
    data: { sellerId, orderId, amount: productPrice },
  });
}
