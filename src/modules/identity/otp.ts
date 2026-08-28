import { randomInt, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { normalizeEgyptianPhone } from "./phone";
import { getSmsProvider } from "./sms";
import { createSession } from "./session";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_REQUEST_COOLDOWN_SECONDS = 60;
const OTP_REQUEST_MAX_PER_PHONE_WINDOW = 5;
const OTP_REQUEST_MAX_PER_IP_WINDOW = 15;
const OTP_REQUEST_WINDOW_SECONDS = 15 * 60;

function hashCode(phone: string, code: string) {
  const pepper = env.OTP_PEPPER ?? "dev-only-pepper";
  return createHash("sha256").update(`${phone}:${code}:${pepper}`).digest("hex");
}

export type RequestOtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; reason: "invalid_phone" | "rate_limited" };

export async function requestOtp(rawPhone: string, ip: string): Promise<RequestOtpResult> {
  const phone = normalizeEgyptianPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const cooldownKey = `otp:cooldown:${phone}`;
  const phoneWindowKey = `otp:phone-window:${phone}`;
  const ipWindowKey = `otp:ip-window:${ip}`;

  const [onCooldown, phoneCount, ipCount] = await Promise.all([
    redis.exists(cooldownKey),
    redis.get(phoneWindowKey),
    redis.get(ipWindowKey),
  ]);

  if (
    onCooldown ||
    Number(phoneCount ?? 0) >= OTP_REQUEST_MAX_PER_PHONE_WINDOW ||
    Number(ipCount ?? 0) >= OTP_REQUEST_MAX_PER_IP_WINDOW
  ) {
    return { ok: false, reason: "rate_limited" };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = hashCode(phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await prisma.otpCode.create({ data: { phone, codeHash, expiresAt } });

  await Promise.all([
    redis.set(cooldownKey, "1", "EX", OTP_REQUEST_COOLDOWN_SECONDS),
    redis.multi().incr(phoneWindowKey).expire(phoneWindowKey, OTP_REQUEST_WINDOW_SECONDS).exec(),
    redis.multi().incr(ipWindowKey).expire(ipWindowKey, OTP_REQUEST_WINDOW_SECONDS).exec(),
  ]);

  await getSmsProvider().sendOtp(phone, code);

  // Dev/test convenience only — never populated in production, and no
  // production SMS provider is wired yet (owner-provided credentials
  // required for that), so this is what makes the flow testable end-to-end
  // today without a real SMS gateway.
  return { ok: true, devCode: env.NODE_ENV !== "production" ? code : undefined };
}

export type VerifyOtpResult =
  | { ok: true; userId: string; sessionToken: string; sessionExpiresAt: Date }
  | {
      ok: false;
      reason: "invalid_phone" | "no_active_code" | "incorrect_code" | "expired" | "too_many_attempts";
    };

export async function verifyOtp(
  rawPhone: string,
  code: string,
  meta: { userAgent?: string; ip?: string },
): Promise<VerifyOtpResult> {
  const phone = normalizeEgyptianPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { ok: false, reason: "no_active_code" };
  if (otp.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (otp.attempts >= otp.maxAttempts) return { ok: false, reason: "too_many_attempts" };

  const codeHash = hashCode(phone, code);
  if (codeHash !== otp.codeHash) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "incorrect_code" };
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  const user = await prisma.user.upsert({
    where: { phone },
    update: { phoneVerifiedAt: new Date() },
    create: { phone, phoneVerifiedAt: new Date() },
  });

  const session = await createSession(user.id, meta);

  return {
    ok: true,
    userId: user.id,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
  };
}
