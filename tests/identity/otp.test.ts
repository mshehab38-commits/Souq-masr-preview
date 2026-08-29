import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requestOtp, verifyOtp } from "@/modules/identity/otp";
import { normalizeEgyptianPhone } from "@/modules/identity/phone";

function randomTestPhone(): { raw: string; normalized: string } {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  const raw = `010${suffix}`;
  const normalized = normalizeEgyptianPhone(raw);
  if (!normalized) throw new Error(`test bug: generated an invalid phone number: ${raw}`);
  return { raw, normalized };
}

function randomTestIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
}

async function cleanupPhone(phone: string) {
  await prisma.session.deleteMany({ where: { user: { is: { phone } } } });
  await prisma.otpCode.deleteMany({ where: { phone } });
  await prisma.user.deleteMany({ where: { phone } });
  await redis.del(`otp:cooldown:${phone}`, `otp:phone-window:${phone}`);
}

describe("requestOtp", () => {
  afterEach(async () => {
    await redis.flushdb();
  });

  it("rejects a non-Egyptian-looking phone number", async () => {
    const result = await requestOtp("123", randomTestIp());
    expect(result).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("creates a pending code and returns a dev code outside production", async () => {
    const { raw, normalized } = randomTestPhone();
    try {
      const result = await requestOtp(raw, randomTestIp());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.devCode).toMatch(/^\d{6}$/);
      }

      const stored = await prisma.otpCode.findFirst({ where: { phone: normalized } });
      expect(stored).not.toBeNull();
      expect(stored?.consumedAt).toBeNull();
    } finally {
      await cleanupPhone(normalized);
    }
  });

  it("never logs the raw OTP code — the dev/test path is the devCode response field, not logs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { raw, normalized } = randomTestPhone();
    try {
      const result = await requestOtp(raw, randomTestIp());
      expect(result.ok).toBe(true);
      const code = result.ok ? result.devCode : undefined;
      expect(code).toBeTruthy();

      const loggedLines = warnSpy.mock.calls.map(([line]) => line as string);
      expect(loggedLines.some((line) => line.includes("OTP"))).toBe(true);
      for (const line of loggedLines) {
        const parsed = JSON.parse(line);
        expect(parsed).not.toHaveProperty("code");
        expect(JSON.stringify(parsed)).not.toContain(code);
      }
    } finally {
      warnSpy.mockRestore();
      await cleanupPhone(normalized);
    }
  });

  it("enforces a cooldown between consecutive requests for the same phone", async () => {
    const { raw, normalized } = randomTestPhone();
    try {
      const first = await requestOtp(raw, randomTestIp());
      expect(first.ok).toBe(true);

      const second = await requestOtp(raw, randomTestIp());
      expect(second).toEqual({ ok: false, reason: "rate_limited" });
    } finally {
      await cleanupPhone(normalized);
    }
  });
});

describe("verifyOtp", () => {
  afterEach(async () => {
    await redis.flushdb();
  });

  it("fails with no_active_code when nothing was requested", async () => {
    const { raw, normalized } = randomTestPhone();
    try {
      const result = await verifyOtp(raw, "123456", {});
      expect(result).toEqual({ ok: false, reason: "no_active_code" });
    } finally {
      await cleanupPhone(normalized);
    }
  });

  it("succeeds with the correct dev code and creates a verified user + session", async () => {
    const { raw, normalized } = randomTestPhone();
    try {
      const requested = await requestOtp(raw, randomTestIp());
      expect(requested.ok).toBe(true);
      const code = requested.ok ? (requested.devCode as string) : "";

      const verified = await verifyOtp(raw, code, { ip: "203.0.113.9", userAgent: "vitest" });
      expect(verified.ok).toBe(true);
      if (verified.ok) {
        const user = await prisma.user.findUnique({ where: { id: verified.userId } });
        expect(user?.phone).toBe(normalized);
        expect(user?.phoneVerifiedAt).not.toBeNull();

        const session = await prisma.session.findFirst({ where: { userId: verified.userId } });
        expect(session).not.toBeNull();
      }
    } finally {
      await cleanupPhone(normalized);
    }
  });

  it("increments attempts on a wrong code and locks out after the max attempts", async () => {
    const { raw, normalized } = randomTestPhone();
    try {
      const requested = await requestOtp(raw, randomTestIp());
      expect(requested.ok).toBe(true);
      const correctCode = requested.ok ? (requested.devCode as string) : "";
      const wrongCode = correctCode === "111111" ? "222222" : "111111";

      for (let attempt = 0; attempt < 6; attempt++) {
        const result = await verifyOtp(raw, wrongCode, {});
        if (attempt < 5) {
          expect(result).toEqual({ ok: false, reason: "incorrect_code" });
        } else {
          expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
        }
      }

      // even the correct code is now rejected once the code is locked out
      const finalAttempt = await verifyOtp(raw, correctCode, {});
      expect(finalAttempt).toEqual({ ok: false, reason: "too_many_attempts" });
    } finally {
      await cleanupPhone(normalized);
    }
  });
});
