import { logger } from "@/lib/logger";

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

// Dev/fallback provider — logs the code instead of sending it. Wiring a real
// provider here needs production credentials, which is an owner decision
// (SMS_PROVIDER_API_KEY), not something to invent or block engineering on.
class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string) {
    logger.warn("SMS provider not configured — logging OTP instead of sending it", {
      phone,
      code,
    });
  }
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!cached) {
    cached = new ConsoleSmsProvider();
  }
  return cached;
}
