import { describe, expect, it } from "vitest";
import { CodPaymentProvider } from "@/modules/payments/cod-provider";
import { getPaymentProvider, isOnlinePaymentConfigured } from "@/modules/payments/service";

describe("CodPaymentProvider", () => {
  it("always returns a PENDING payment with no redirect", async () => {
    const provider = new CodPaymentProvider();
    const result = await provider.createPayment({ orderId: "o1", totalAmount: 500, currency: "EGP" });
    expect(result).toEqual({ paymentStatus: "PENDING" });
  });
});

describe("isOnlinePaymentConfigured", () => {
  it("is false when no PAYMOB_* env vars are set (the test environment's default)", () => {
    expect(isOnlinePaymentConfigured()).toBe(false);
  });
});

describe("getPaymentProvider", () => {
  it("returns CodPaymentProvider by default and when CASH_ON_DELIVERY is requested", () => {
    expect(getPaymentProvider().method).toBe("CASH_ON_DELIVERY");
    expect(getPaymentProvider("CASH_ON_DELIVERY").method).toBe("CASH_ON_DELIVERY");
  });

  it("throws rather than silently falling back when ONLINE is requested but not configured", () => {
    expect(() => getPaymentProvider("ONLINE")).toThrow(/not configured/);
  });
});
