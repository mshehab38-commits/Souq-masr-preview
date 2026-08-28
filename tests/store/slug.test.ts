import { describe, expect, it } from "vitest";
import { generateStoreSlug } from "@/modules/store/slug";

describe("generateStoreSlug", () => {
  it("derives an ASCII base from a Latin name and appends a random suffix", () => {
    const slug = generateStoreSlug("Cairo Electronics Store");
    expect(slug).toMatch(/^cairo-electronics-store-[0-9a-f]{8}$/);
  });

  it("falls back to a generic base when the name has no ASCII/digit content", () => {
    const slug = generateStoreSlug("متجر القاهرة للإلكترونيات");
    expect(slug).toMatch(/^store-[0-9a-f]{8}$/);
  });

  it("produces a different slug on each call, even for the same name", () => {
    const first = generateStoreSlug("Same Name");
    const second = generateStoreSlug("Same Name");
    expect(first).not.toBe(second);
  });

  it("strips punctuation and collapses whitespace", () => {
    const slug = generateStoreSlug("Ahmed's   Mobile & Electronics!!!");
    expect(slug).toMatch(/^ahmeds-mobile-electronics-[0-9a-f]{8}$/);
  });
});
