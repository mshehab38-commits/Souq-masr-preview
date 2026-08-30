import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Deliberately simple — this only gates whether we attempt to send,
// never whether login can succeed (email is not a credential). A
// hand-rolled regex, not zod's .email(), to match this module's existing
// normalizeEgyptianPhone convention: identity-field normalization is
// always a pure function here, even though zod is already a dependency
// used at the API-boundary layer (see src/app/api/profile/route.ts's
// patchSchema).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export interface EmailProvider {
  sendNotification(to: string, subject: string, text: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async sendNotification(to: string) {
    logger.info("Email provider not configured — notification email not actually sent", { to });
  }
}

class HttpEmailProvider implements EmailProvider {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  async sendNotification(to: string, subject: string, text: string): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ to, subject, text }),
      });
      if (!response.ok) {
        logger.error("Email provider request failed", { to, status: response.status });
      }
    } catch (error) {
      logger.error("Email provider request threw", { to, error: String(error) });
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached =
      env.EMAIL_PROVIDER_API_URL && env.EMAIL_PROVIDER_API_KEY
        ? new HttpEmailProvider(env.EMAIL_PROVIDER_API_URL, env.EMAIL_PROVIDER_API_KEY)
        : new ConsoleEmailProvider();
  }
  return cached;
}
