export interface PaymentOrderInfo {
  orderId: string;
  totalAmount: number;
  currency: string;
  buyerName?: string;
  buyerPhone?: string;
}

export interface CreatePaymentResult {
  // COD: PENDING (settled manually at delivery). Online: PENDING until the
  // gateway's webhook confirms it (see PaymentProvider.verifyWebhook).
  paymentStatus: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED";
  // Present only for online providers — where to send the buyer to pay.
  redirectUrl?: string;
  // The gateway's own reference for this payment, for reconciliation.
  providerReference?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  orderId?: string;
  status?: "CAPTURED" | "FAILED";
  // The amount/currency the gateway says was actually paid, straight from
  // the (HMAC-verified) payload — surfaced so the caller can independently
  // cross-check them against the order's own expected totalAmount/currency
  // before trusting a CAPTURED status. A valid signature only proves the
  // payload's authenticity, never that it applies to the right amount for
  // this specific order.
  amountCents?: number;
  currency?: string;
}

export interface PaymentProvider {
  readonly method: "CASH_ON_DELIVERY" | "ONLINE";
  createPayment(order: PaymentOrderInfo): Promise<CreatePaymentResult>;
  // Only meaningful for online providers — verifies a gateway webhook's
  // authenticity (HMAC or equivalent) before trusting its payload.
  verifyWebhook?(rawBody: string, headers: Record<string, string>): WebhookVerificationResult;
}
