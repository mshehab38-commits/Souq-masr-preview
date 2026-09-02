// A valid HMAC only proves a webhook payload's authenticity, never that it
// applies to the right amount for a specific order — a future retry/
// idempotency bug, a manually-created gateway order, or a dashboard amount
// edit could all produce a validly-signed payload for the wrong amount.
// This cross-checks the two independently before a caller ever trusts a
// CAPTURED status. Amounts are compared in cents (the gateway's own unit)
// rather than converting cents to a float, to avoid floating-point
// comparison entirely.
export function webhookAmountMatchesOrder(
  order: { totalAmount: number; currency: string },
  verification: { amountCents?: number; currency?: string },
): boolean {
  const expectedAmountCents = Math.round(order.totalAmount * 100);
  return verification.amountCents === expectedAmountCents && verification.currency === order.currency;
}
