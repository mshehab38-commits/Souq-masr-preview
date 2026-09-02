import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PaymobPaymentProvider } from "@/modules/payments/paymob-provider";
import { webhookAmountMatchesOrder } from "@/modules/payments/webhook-amount";

const HMAC_SECRET = "test-hmac-secret";

// Builds a synthetic Paymob-shaped transaction-processed callback payload
// and its matching HMAC — mirrors the exact field list/order
// verifyWebhook() itself expects (see paymob-provider.ts), so this proves
// the parsing/verification logic without needing real Paymob credentials
// or sandbox access (that remains a separate, owner-credential-gated
// deferred item — see docs/DECISIONS.md).
function buildPayload(overrides: {
  success?: boolean;
  merchantOrderIdLocation?: "nested" | "top-level" | "both" | "none";
} = {}) {
  const { success = true, merchantOrderIdLocation = "nested" } = overrides;

  const obj: Record<string, unknown> = {
    amount_cents: 50000,
    created_at: "2026-08-30T12:00:00Z",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    id: 123456,
    integration_id: 789,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: {
      id: 111,
      ...(merchantOrderIdLocation === "nested" || merchantOrderIdLocation === "both"
        ? { merchant_order_id: "order-abc-123" }
        : {}),
    },
    owner: 42,
    pending: false,
    source_data: { pan: "1234", sub_type: "MASTERCARD", type: "card" },
    success,
  };

  const payload: Record<string, unknown> = { obj };
  if (merchantOrderIdLocation === "top-level" || merchantOrderIdLocation === "both") {
    payload.merchant_order_id = "order-abc-123";
  }

  const orderObj = obj.order as Record<string, unknown>;
  const sourceData = obj.source_data as Record<string, unknown>;
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
  const hmac = createHmac("sha512", HMAC_SECRET).update(concatenated).digest("hex");

  return { rawBody: JSON.stringify(payload), hmac };
}

describe("PaymobPaymentProvider.verifyWebhook", () => {
  const provider = new PaymobPaymentProvider({
    apiKey: "k",
    integrationId: "i",
    iframeId: "f",
    hmacSecret: HMAC_SECRET,
  });

  it("accepts a validly-signed successful payload and resolves the nested order id", () => {
    const { rawBody, hmac } = buildPayload({ success: true, merchantOrderIdLocation: "nested" });
    const result = provider.verifyWebhook(rawBody, { hmac });
    expect(result).toEqual({
      valid: true,
      orderId: "order-abc-123",
      status: "CAPTURED",
      amountCents: 50000,
      currency: "EGP",
    });
  });

  it("falls back to a top-level merchant_order_id when it isn't nested under obj.order", () => {
    const { rawBody, hmac } = buildPayload({ success: true, merchantOrderIdLocation: "top-level" });
    const result = provider.verifyWebhook(rawBody, { hmac });
    expect(result).toEqual({
      valid: true,
      orderId: "order-abc-123",
      status: "CAPTURED",
      amountCents: 50000,
      currency: "EGP",
    });
  });

  it("resolves status FAILED for an unsuccessful transaction", () => {
    const { rawBody, hmac } = buildPayload({ success: false });
    const result = provider.verifyWebhook(rawBody, { hmac });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("FAILED");
  });

  it("rejects a payload whose HMAC doesn't match", () => {
    const { rawBody } = buildPayload();
    const result = provider.verifyWebhook(rawBody, { hmac: "0".repeat(128) });
    expect(result).toEqual({ valid: false });
  });

  it("rejects a wrong-length hmac without throwing (timingSafeEqual requires equal-length buffers)", () => {
    const { rawBody } = buildPayload();
    const result = provider.verifyWebhook(rawBody, { hmac: "abcd" });
    expect(result).toEqual({ valid: false });
  });

  it("rejects a request with no hmac header at all", () => {
    const { rawBody } = buildPayload();
    const result = provider.verifyWebhook(rawBody, {});
    expect(result).toEqual({ valid: false });
  });

  it("rejects malformed JSON rather than throwing", () => {
    const result = provider.verifyWebhook("{not json", { hmac: "anything" });
    expect(result).toEqual({ valid: false });
  });

  it("returns undefined orderId when merchant_order_id is present nowhere", () => {
    const { rawBody, hmac } = buildPayload({ merchantOrderIdLocation: "none" });
    const result = provider.verifyWebhook(rawBody, { hmac });
    expect(result.valid).toBe(true);
    expect(result.orderId).toBeUndefined();
  });
});

describe("webhookAmountMatchesOrder", () => {
  it("matches when the amount (converted to cents) and currency both agree", () => {
    expect(
      webhookAmountMatchesOrder({ totalAmount: 500, currency: "EGP" }, { amountCents: 50000, currency: "EGP" }),
    ).toBe(true);
  });

  it("rejects a lower paid amount than the order actually owes", () => {
    expect(
      webhookAmountMatchesOrder({ totalAmount: 500, currency: "EGP" }, { amountCents: 40000, currency: "EGP" }),
    ).toBe(false);
  });

  it("rejects a higher paid amount than the order actually owes", () => {
    expect(
      webhookAmountMatchesOrder({ totalAmount: 500, currency: "EGP" }, { amountCents: 60000, currency: "EGP" }),
    ).toBe(false);
  });

  it("rejects a currency mismatch even when the amount matches", () => {
    expect(
      webhookAmountMatchesOrder({ totalAmount: 500, currency: "EGP" }, { amountCents: 50000, currency: "USD" }),
    ).toBe(false);
  });

  it("rejects when the webhook carries no amount/currency at all", () => {
    expect(webhookAmountMatchesOrder({ totalAmount: 500, currency: "EGP" }, {})).toBe(false);
  });

  it("handles fractional piastres correctly via rounding", () => {
    expect(
      webhookAmountMatchesOrder({ totalAmount: 199.99, currency: "EGP" }, { amountCents: 19999, currency: "EGP" }),
    ).toBe(true);
  });
});
