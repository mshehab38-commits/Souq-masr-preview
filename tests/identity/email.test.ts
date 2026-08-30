import { describe, expect, it, vi } from "vitest";
import { getEmailProvider } from "@/modules/identity/email";

// No EMAIL_PROVIDER_API_URL/EMAIL_PROVIDER_API_KEY is set in the test
// environment, so getEmailProvider() always resolves to the console
// fallback here — mirrors sms.test.ts's console-fallback coverage.
describe("getEmailProvider (console fallback)", () => {
  it("sendNotification logs without throwing and never omits the recipient address", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await expect(
        getEmailProvider().sendNotification("user@example.com", "تم شحن طلبك", "سيصلك خلال يومين"),
      ).resolves.toBeUndefined();

      const loggedLines = logSpy.mock.calls.map(([line]) => line as string);
      const matching = loggedLines.find((line) => line.includes("user@example.com"));
      expect(matching).toBeTruthy();

      // The console fallback never actually transmits the subject/text —
      // only that a send was attempted, and to whom.
      const parsed = JSON.parse(matching as string);
      expect(parsed).not.toHaveProperty("subject");
      expect(parsed).not.toHaveProperty("text");
    } finally {
      logSpy.mockRestore();
    }
  });
});
