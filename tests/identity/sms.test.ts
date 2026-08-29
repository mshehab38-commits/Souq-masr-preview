import { describe, expect, it, vi } from "vitest";
import { getSmsProvider } from "@/modules/identity/sms";

// No SMS_PROVIDER_API_URL/SMS_PROVIDER_API_KEY is set in the test
// environment, so getSmsProvider() always resolves to the console
// fallback here — this exercises that path directly, the same way
// otp.test.ts already covers sendOtp's safe-logging behavior.
describe("getSmsProvider (console fallback)", () => {
  it("sendMessage logs without throwing and never omits the phone", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await expect(getSmsProvider().sendMessage("+201012345678", "تم شحن طلبك")).resolves.toBeUndefined();

      const loggedLines = logSpy.mock.calls.map(([line]) => line as string);
      const matching = loggedLines.find((line) => line.includes("+201012345678"));
      expect(matching).toBeTruthy();

      // The console fallback never actually transmits the message text —
      // only that a send was attempted, and to whom.
      const parsed = JSON.parse(matching as string);
      expect(parsed).not.toHaveProperty("text");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("sendOtp still never logs the raw code, even now that sendMessage exists", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await getSmsProvider().sendOtp("+201098765432", "654321");
      const loggedLines = warnSpy.mock.calls.map(([line]) => line as string);
      for (const line of loggedLines) {
        expect(line).not.toContain("654321");
      }
    } finally {
      warnSpy.mockRestore();
    }
  });
});
