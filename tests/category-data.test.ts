import { describe, expect, it } from "vitest";
import { categories } from "../prisma/category-data";

describe("category seed data", () => {
  it("covers all 16 categories from the original prototype", () => {
    expect(categories).toHaveLength(16);
  });

  it("has a unique slug per category", () => {
    const slugs = categories.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every category at least one data-driven attribute", () => {
    for (const category of categories) {
      expect(category.attributes.length).toBeGreaterThan(0);
    }
  });

  it("has a unique attribute key within each category", () => {
    for (const category of categories) {
      const keys = category.attributes.map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("provides options for every SELECT attribute", () => {
    for (const category of categories) {
      for (const attribute of category.attributes) {
        if (attribute.type === "SELECT") {
          expect(attribute.options?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });
});
