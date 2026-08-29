import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentProvider, isOnlinePaymentConfigured } from "@/modules/payments/service";
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
    await prisma.order.updateMany({
      where: { id: verification.orderId, paymentStatus: "PENDING" },
      data: { paymentStatus: "CAPTURED" },
    });
  } else if (verification.orderId && verification.status === "FAILED") {
    await prisma.order.updateMany({
      where: { id: verification.orderId, paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });
  }

  return NextResponse.json({ received: true });
});
