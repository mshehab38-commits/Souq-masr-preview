import { logger } from "@/lib/logger";

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

// Dev/fallback provider. Wiring a real provider here needs production
// credentials, which is an owner decision (SMS_PROVIDER_API_KEY), not
// something to invent or block engineering on.
//
// Deliberately never logs `code`: the dev/test path for reading an OTP is
// the API response's `devCode` field (see otp.ts), gated to non-production
// and read directly by every test/e2e spec — never from logs. Logging the
// raw code here would mean any environment that ran this provider
// unconfigured (including production, before a real SMS provider is wired)
// would leak a live login code to whatever captures stdout.
class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string) {
    logger.warn("SMS provider not configured — OTP not actually sent", { phone });
  }
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!cached) {
    cached = new ConsoleSmsProvider();
  }
  return cached;
}
