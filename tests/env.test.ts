import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  APP_URL: "http://localhost:3000",
};

describe("loadEnv", () => {
  it("accepts a fully valid environment", () => {
    expect(() => loadEnv(validEnv)).not.toThrow();
  });

  it("fails at load time when DATABASE_URL is missing", () => {
    expect(() =>
      loadEnv({ REDIS_URL: validEnv.REDIS_URL, APP_URL: validEnv.APP_URL }),
    ).toThrow(/DATABASE_URL/);
  });

  it("fails at load time when REDIS_URL is not a valid URL", () => {
    expect(() => loadEnv({ ...validEnv, REDIS_URL: "not-a-url" })).toThrow(/REDIS_URL/);
  });

  it("defaults NODE_ENV to development and APP_URL to localhost", () => {
    const parsed = loadEnv({ DATABASE_URL: validEnv.DATABASE_URL, REDIS_URL: validEnv.REDIS_URL });
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.APP_URL).toBe("http://localhost:3000");
  });
});
