import { describe, expect, it } from "vitest";
import { normalizeEgyptianPhone, formatEgyptianPhoneLocal } from "@/modules/identity/phone";

describe("normalizeEgyptianPhone", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["+201112345678", "+201112345678"],
    ["00201212345678", "+201212345678"],
    ["201512345678", "+201512345678"],
    ["010 1234 5678", "+201012345678"],
    ["010-1234-5678", "+201012345678"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeEgyptianPhone(input)).toBe(expected);
  });

  it.each([
    "0100123456", // too short
    "020123456789", // wrong prefix (landline-style, not 010/011/012/015)
    "01312345678", // 013 is not an Egyptian mobile prefix
    "not-a-phone",
    "",
  ])("rejects invalid input: %s", (input) => {
    expect(normalizeEgyptianPhone(input)).toBeNull();
  });
});

describe("formatEgyptianPhoneLocal", () => {
  it("formats an E.164 number back into a spaced local format", () => {
    expect(formatEgyptianPhoneLocal("+201012345678")).toBe("010 123 45678");
  });
});
