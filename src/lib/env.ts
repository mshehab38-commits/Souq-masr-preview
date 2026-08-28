import { z } from "zod";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    APP_URL: z.string().url().default("http://localhost:3000"),
    OTP_PEPPER: z.string().min(16).optional(),
  })
  .refine((data) => data.NODE_ENV !== "production" || Boolean(data.OTP_PEPPER), {
    message: "OTP_PEPPER is required in production (no safe default)",
    path: ["OTP_PEPPER"],
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
