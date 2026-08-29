import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
  // General-purpose transactional SMS (order updates, moderation
  // decisions, etc. — Phase 11), separate from sendOtp because the OTP
  // path has its own safe-logging constraint (see below) that a generic
  // text message doesn't.
  sendMessage(phone: string, text: string): Promise<void>;
}

// Dev/fallback provider. Wiring a real provider here needs production
// credentials, which is an owner decision (SMS_PROVIDER_API_URL/
// SMS_PROVIDER_API_KEY), not something to invent or block engineering on.
//
// Deliberately never logs the OTP `code`: the dev/test path for reading
// an OTP is the API response's `devCode` field (see otp.ts), gated to
// non-production and read directly by every test/e2e spec — never from
// logs. Logging the raw code here would mean any environment that ran
// this provider unconfigured (including production, before a real SMS
// provider is wired) would leak a live login code to whatever captures
// stdout.
class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string) {
    logger.warn("SMS provider not configured — OTP not actually sent", { phone });
  }

  async sendMessage(phone: string) {
    logger.info("SMS provider not configured — notification SMS not actually sent", { phone });
  }
}

// Real provider, deliberately vendor-agnostic: a plain POST of
// { to, message } with a bearer token, rather than a specific gateway's
// exact request/response contract. No real SMS gateway credentials exist
// to build and verify a vendor-specific integration against (the same
// situation Paymob was in before its sandbox could be exercised) — this
// is the shape a thin adapter in front of whichever gateway the owner
// picks can satisfy, without this codebase guessing at (and likely
// getting wrong) one vendor's undocumented specifics. See
// docs/DECISIONS.md.
class HttpSmsProvider implements SmsProvider {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  private async post(phone: string, message: string): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ to: phone, message }),
      });
      if (!response.ok) {
        logger.error("SMS provider request failed", { phone, status: response.status });
      }
    } catch (error) {
      // Never let a network/gateway failure propagate into the caller's
      // flow (OTP request, notification creation) — same "log, don't
      // throw" posture as every other best-effort side effect in this
      // codebase (e.g. incrementListingViewCount).
      logger.error("SMS provider request threw", { phone, error: String(error) });
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.post(phone, `رمز التحقق الخاص بك في سوق مصر هو: ${code}`);
  }

  async sendMessage(phone: string, text: string): Promise<void> {
    await this.post(phone, text);
  }
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!cached) {
    cached =
      env.SMS_PROVIDER_API_URL && env.SMS_PROVIDER_API_KEY
        ? new HttpSmsProvider(env.SMS_PROVIDER_API_URL, env.SMS_PROVIDER_API_KEY)
        : new ConsoleSmsProvider();
  }
  return cached;
}
