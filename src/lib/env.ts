import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  OTP_PEPPER: z.string().min(16).optional(),
  // Object storage (Cloudflare R2 / S3-compatible). Optional outside
  // production, where the app falls back to local-filesystem storage for
  // dev/test only; required in production (see the refinement below) since
  // production images must never live on the application server.
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_PUBLIC_CDN_URL: z.string().url().optional(),
  // Online payment gateway (Paymob). Entirely optional: cash-on-delivery
  // (CodPaymentProvider) is the only active PaymentProvider until real
  // production credentials are supplied — a production-credentials
  // decision for the owner, never invented here. See
  // src/modules/payments/paymob-provider.ts.
  PAYMOB_API_KEY: z.string().min(1).optional(),
  PAYMOB_INTEGRATION_ID: z.string().min(1).optional(),
  PAYMOB_IFRAME_ID: z.string().min(1).optional(),
  PAYMOB_HMAC_SECRET: z.string().min(1).optional(),
  // Sentry (error tracking). Entirely optional, in every environment,
  // including production — activation is an owner decision (a real
  // project DSN), never invented here. See docs/OBSERVABILITY.md.
  // Server/edge DSN and the client-bundle DSN are separate values (the
  // client one must be NEXT_PUBLIC_-prefixed to reach the browser bundle)
  // but are typically the same DSN in practice.
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // SMS gateway for general notifications (order updates, moderation
  // decisions, etc.) beyond OTP. Entirely optional, in every environment:
  // until both are set, ConsoleSmsProvider is used (logs only, never
  // sends). Deliberately vendor-agnostic (a plain POST of { to, message }
  // with a bearer token) rather than a specific gateway's exact API
  // contract — no real SMS gateway credentials exist to verify one
  // against. See src/modules/identity/sms.ts and docs/DECISIONS.md.
  SMS_PROVIDER_API_URL: z.string().url().optional(),
  SMS_PROVIDER_API_KEY: z.string().min(1).optional(),
  // Email gateway for general notifications (order updates, moderation
  // decisions, etc.), delivered to User.email when a user has set one.
  // Entirely optional, in every environment, including production: until
  // both are set, ConsoleEmailProvider is used (logs only, never sends).
  // Deliberately vendor-agnostic (a plain POST of { to, subject, text }
  // with a bearer token) rather than a specific vendor's API (SendGrid/
  // Resend/SES/Postmark/etc.) — no vendor has been chosen and none is
  // guessed here, same reasoning as SMS. See
  // src/modules/identity/email.ts and docs/DECISIONS.md.
  EMAIL_PROVIDER_API_URL: z.string().url().optional(),
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
});

export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV !== "production") return;

  if (!data.OTP_PEPPER) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OTP_PEPPER"],
      message: "OTP_PEPPER is required in production (no safe default)",
    });
  }

  const storageKeys = [
    "STORAGE_ENDPOINT",
    "STORAGE_BUCKET",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
    "STORAGE_PUBLIC_CDN_URL",
  ] as const;
  const missingStorage = storageKeys.filter((key) => !data[key]);
  if (missingStorage.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STORAGE_ENDPOINT"],
      message: `Object storage must be configured in production (missing: ${missingStorage.join(", ")}) — images must never fall back to local filesystem storage`,
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
