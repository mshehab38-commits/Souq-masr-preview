import type { CreatePaymentResult, PaymentOrderInfo, PaymentProvider } from "./types";

// Cash-on-delivery: the default, production-viable payment method for the
// Egyptian market that requires no gateway integration, no merchant
// account, and no processing fee at all — the buyer pays the
// seller/courier directly. No money ever passes through Souq Masr for
// these orders (see docs/PAYMENTS.md and the SellerPayout model comment).
export class CodPaymentProvider implements PaymentProvider {
  readonly method = "CASH_ON_DELIVERY" as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match PaymentProvider
  async createPayment(order: PaymentOrderInfo): Promise<CreatePaymentResult> {
    return { paymentStatus: "PENDING" };
  }
}
