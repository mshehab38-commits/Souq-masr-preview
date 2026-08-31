import { afterEach, describe, expect, it } from "vitest";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";

const usedKeys: string[] = [];

function makeKey(prefix: string) {
  const key = `${prefix}:${Math.random().toString(36).slice(2)}`;
  usedKeys.push(key);
  return key;
}

describe("checkRateLimit", () => {
  afterEach(async () => {
    if (usedKeys.length > 0) {
      await redis.del(...usedKeys);
      usedKeys.length = 0;
    }
  });

  it("allows the first max calls for a key and rejects the max + 1th", async () => {
    const key = makeKey("test-rate-limit");
    const results = [
      await checkRateLimit(key, 3, 60),
      await checkRateLimit(key, 3, 60),
      await checkRateLimit(key, 3, 60),
      await checkRateLimit(key, 3, 60),
    ];
    expect(results).toEqual([true, true, true, false]);
  });

  it("tracks separate keys independently", async () => {
    const keyA = makeKey("test-rate-limit-a");
    const keyB = makeKey("test-rate-limit-b");

    expect(await checkRateLimit(keyA, 1, 60)).toBe(true);
    expect(await checkRateLimit(keyA, 1, 60)).toBe(false);
    expect(await checkRateLimit(keyB, 1, 60)).toBe(true);
  });

  it("resets once the window has elapsed", async () => {
    const key = makeKey("test-rate-limit-window");
    expect(await checkRateLimit(key, 1, 1)).toBe(true);
    expect(await checkRateLimit(key, 1, 1)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(await checkRateLimit(key, 1, 1)).toBe(true);
  });
});
