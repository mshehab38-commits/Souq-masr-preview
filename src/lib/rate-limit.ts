import { redis } from "@/lib/redis";

// A generic Redis fixed-window rate limiter — the same "GET current
// count, compare to max, INCR+EXPIRE on the request that's allowed
// through" shape already hand-rolled independently in
// src/modules/identity/otp.ts (phone/IP OTP-request windows) and
// src/modules/moderation/reports.ts (per-reporter window). New call
// sites should use this rather than hand-rolling a third copy; the two
// existing ones are deliberately left untouched — see docs/DECISIONS.md.
//
// Fixed window, not a true sliding log: up to `max` requests can land in
// the last moments of one window and another `max` in the first moments
// of the next. Both existing hand-rolled limiters already accept this
// same tradeoff — sufficient for anti-abuse infrastructure limits at
// this codebase's scale.
//
// Returns true (and increments the counter) if this request is allowed;
// false (without incrementing) once `key` has already recorded `max`
// requests within the current `windowSeconds` window.
export async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const current = await redis.get(key);
  if (Number(current ?? 0) >= max) {
    return false;
  }
  await redis.multi().incr(key).expire(key, windowSeconds).exec();
  return true;
}
