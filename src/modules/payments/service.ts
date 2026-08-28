import { env } from "@/lib/env";
import { CodPaymentProvider } from "./cod-provider";
import { PaymobPaymentProvider } from "./paymob-provider";
import type { PaymentProvider } from "./types";

export type { PaymentProvider, PaymentOrderInfo, CreatePaymentResult, WebhookVerificationResult } from "./types";

let codProvider: CodPaymentProvider | null = null;
let paymobProvider: PaymobPaymentProvider | null = null;

// Cash-on-delivery is always available and is the default for every
// checkout today. Online (Paymob) is only ever returned once real
// production credentials exist — never fabricated. See
// paymob-provider.ts's class comment.
export function getPaymentProvider(method: "CASH_ON_DELIVERY" | "ONLINE" = "CASH_ON_DELIVERY"): PaymentProvider {
  if (method === "ONLINE") {
    if (!isOnlinePaymentConfigured()) {
      throw new Error(
        "Online payment is not configured — PAYMOB_API_KEY/PAYMOB_INTEGRATION_ID/PAYMOB_IFRAME_ID/PAYMOB_HMAC_SECRET must all be set.",
      );
    }
    if (!paymobProvider) {
      paymobProvider = new PaymobPaymentProvider({
        apiKey: env.PAYMOB_API_KEY!,
        integrationId: env.PAYMOB_INTEGRATION_ID!,
        iframeId: env.PAYMOB_IFRAME_ID!,
        hmacSecret: env.PAYMOB_HMAC_SECRET!,
      });
    }
    return paymobProvider;
  }

  if (!codProvider) codProvider = new CodPaymentProvider();
  return codProvider;
}

export function isOnlinePaymentConfigured(): boolean {
  return Boolean(
    env.PAYMOB_API_KEY && env.PAYMOB_INTEGRATION_ID && env.PAYMOB_IFRAME_ID && env.PAYMOB_HMAC_SECRET,
  );
}
