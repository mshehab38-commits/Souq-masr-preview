import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/modules/identity/email";

describe("normalizeEmail", () => {
  it.each([
    ["User@Example.com", "user@example.com"],
    ["  a@b.co  ", "a@b.co"],
    ["buyer+listing@souqmasr.eg", "buyer+listing@souqmasr.eg"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it.each(["not-an-email", "a@b", "@b.com", "a@.com", "", "   ", "a".repeat(255) + "@b.com"])(
    "rejects invalid input: %s",
    (input) => {
      expect(normalizeEmail(input)).toBeNull();
    },
  );
});
