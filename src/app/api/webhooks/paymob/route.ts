import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentProvider, isOnlinePaymentConfigured, webhookAmountMatchesOrder } from "@/modules/payments/service";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

// Inert until PAYMOB_* env vars are configured — see
// src/modules/payments/paymob-provider.ts. Structured now so the route
// exists and is registerable with Paymob as a callback URL the moment
// real credentials are supplied, without needing a code change then.
export const POST = withApiHandler(async (request: Request) => {
  if (!isOnlinePaymentConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  const provider = getPaymentProvider("ONLINE");
  const verification = provider.verifyWebhook?.(rawBody, headers);
  if (!verification?.valid) {
    logger.warn("Rejected Paymob webhook: invalid HMAC");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (verification.orderId && verification.status === "CAPTURED") {
    // A valid HMAC only proves the payload genuinely came from Paymob — it
    // never proves the paid amount applies to THIS order. Cross-check
    // amount/currency against the order's own snapshotted totalAmount
    // before ever flipping it to CAPTURED, so a mismatched payload (a
    // future retry/idempotency bug, a manually-created Paymob order, a
    // dashboard amount edit) is caught rather than silently trusted.
    const order = await prisma.order.findUnique({
      where: { id: verification.orderId },
      select: { totalAmount: true, currency: true, paymentStatus: true },
    });
    if (!order) {
      logger.warn("Paymob webhook: CAPTURED for an unknown order", { orderId: verification.orderId });
    } else {
      const orderTotal = Number(order.totalAmount);
      if (!webhookAmountMatchesOrder({ totalAmount: orderTotal, currency: order.currency }, verification)) {
        logger.error("Paymob webhook: amount/currency mismatch — refusing to mark order CAPTURED", {
          orderId: verification.orderId,
          expectedAmountCents: Math.round(orderTotal * 100),
          receivedAmountCents: verification.amountCents,
          expectedCurrency: order.currency,
          receivedCurrency: verification.currency,
        });
      } else {
        await prisma.order.updateMany({
          where: { id: verification.orderId, paymentStatus: "PENDING" },
          data: { paymentStatus: "CAPTURED" },
        });
      }
    }
  } else if (verification.orderId && verification.status === "FAILED") {
    await prisma.order.updateMany({
      where: { id: verification.orderId, paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });
  }

  return NextResponse.json({ received: true });
});
