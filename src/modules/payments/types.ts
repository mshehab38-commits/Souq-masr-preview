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
}

export interface PaymentProvider {
  readonly method: "CASH_ON_DELIVERY" | "ONLINE";
  createPayment(order: PaymentOrderInfo): Promise<CreatePaymentResult>;
  // Only meaningful for online providers — verifies a gateway webhook's
  // authenticity (HMAC or equivalent) before trusting its payload.
  verifyWebhook?(rawBody: string, headers: Record<string, string>): WebhookVerificationResult;
}
