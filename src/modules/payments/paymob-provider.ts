import { createHmac } from "node:crypto";
import type { CreatePaymentResult, PaymentOrderInfo, PaymentProvider, WebhookVerificationResult } from "./types";

const PAYMOB_BASE_URL = "https://accept.paymob.com/api";

export interface PaymobConfig {
  apiKey: string;
  integrationId: string;
  iframeId: string;
  hmacSecret: string;
}

// Real Paymob "Accept" API v1 integration (auth token → order registration
// → payment key → iframe redirect), built to their publicly documented
// flow. It has never been exercised against Paymob's live sandbox — that
// requires real merchant credentials, which is a production-credentials
// decision for the owner (see docs/PAYMENTS.md), not something to invent
// or fake here. getPaymentProvider() only ever returns this class once all
// four PaymobConfig values are present; until then, CodPaymentProvider is
// what every checkout actually uses. Before going live: verify this exact
// request/response shape and the webhook HMAC field order against
// Paymob's current sandbox — their public API has changed shape before.
export class PaymobPaymentProvider implements PaymentProvider {
  readonly method = "ONLINE" as const;

  constructor(private readonly config: PaymobConfig) {}

  private async fetchAuthToken(): Promise<string> {
    const response = await fetch(`${PAYMOB_BASE_URL}/auth/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.config.apiKey }),
    });
    if (!response.ok) throw new Error(`Paymob auth failed: ${response.status}`);
    const data = (await response.json()) as { token: string };
    return data.token;
  }

  private async registerOrder(authToken: string, order: PaymentOrderInfo): Promise<number> {
    const response = await fetch(`${PAYMOB_BASE_URL}/ecommerce/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: Math.round(order.totalAmount * 100),
        currency: order.currency,
        merchant_order_id: order.orderId,
        items: [],
      }),
    });
    if (!response.ok) throw new Error(`Paymob order registration failed: ${response.status}`);
    const data = (await response.json()) as { id: number };
    return data.id;
  }

  private async requestPaymentKey(
    authToken: string,
    paymobOrderId: number,
    order: PaymentOrderInfo,
  ): Promise<string> {
    const response = await fetch(`${PAYMOB_BASE_URL}/acceptance/payment_keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: authToken,
        amount_cents: Math.round(order.totalAmount * 100),
        expiration: 3600,
        order_id: paymobOrderId,
        currency: order.currency,
        integration_id: this.config.integrationId,
        billing_data: {
          first_name: order.buyerName ?? "N/A",
          last_name: "N/A",
          phone_number: order.buyerPhone ?? "N/A",
          email: "N/A",
          apartment: "N/A",
          floor: "N/A",
          street: "N/A",
          building: "N/A",
          city: "N/A",
          country: "EG",
          state: "N/A",
        },
      }),
    });
    if (!response.ok) throw new Error(`Paymob payment key request failed: ${response.status}`);
    const data = (await response.json()) as { token: string };
    return data.token;
  }

  async createPayment(order: PaymentOrderInfo): Promise<CreatePaymentResult> {
    const authToken = await this.fetchAuthToken();
    const paymobOrderId = await this.registerOrder(authToken, order);
    const paymentKey = await this.requestPaymentKey(authToken, paymobOrderId, order);

    return {
      paymentStatus: "PENDING",
      redirectUrl: `${PAYMOB_BASE_URL}/acceptance/iframes/${this.config.iframeId}?payment_token=${paymentKey}`,
      providerReference: String(paymobOrderId),
    };
  }

  // Paymob's documented HMAC covers a fixed, ordered list of transaction
  // fields concatenated as strings, hashed with HMAC-SHA512 using the
  // merchant's HMAC secret. Field order matters and must match Paymob's
  // current documentation exactly — verify against their sandbox before
  // relying on this in production.
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookVerificationResult {
    const providedHmac = headers["hmac"] ?? headers["Hmac"];
    if (!providedHmac) return { valid: false };

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false };
    }

    const obj = (payload.obj ?? payload) as Record<string, unknown>;
    const orderObj = (obj.order ?? {}) as Record<string, unknown>;
    const sourceData = (obj.source_data ?? {}) as Record<string, unknown>;

    const fields = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_refunded,
      obj.is_standalone_payment,
      obj.is_voided,
      orderObj.id,
      obj.owner,
      obj.pending,
      sourceData.pan,
      sourceData.sub_type,
      sourceData.type,
      obj.success,
    ];

    const concatenated = fields.map((value) => String(value ?? "")).join("");
    const computedHmac = createHmac("sha512", this.config.hmacSecret).update(concatenated).digest("hex");

    if (computedHmac !== providedHmac) return { valid: false };

    return {
      valid: true,
      orderId: (payload as { merchant_order_id?: string }).merchant_order_id,
      status: obj.success ? "CAPTURED" : "FAILED",
    };
  }
}
