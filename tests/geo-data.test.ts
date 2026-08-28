import { describe, expect, it } from "vitest";
import { governorates } from "../prisma/geo-data";

describe("governorate seed data", () => {
  it("covers all 27 governorates of Egypt", () => {
    expect(governorates).toHaveLength(27);
  });

  it("has a unique slug per governorate", () => {
    const slugs = governorates.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every governorate at least one seeded city", () => {
    for (const gov of governorates) {
      expect(gov.cities.length).toBeGreaterThan(0);
    }
  });

  it("has a unique city slug within each governorate", () => {
    for (const gov of governorates) {
      const slugs = gov.cities.map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});
