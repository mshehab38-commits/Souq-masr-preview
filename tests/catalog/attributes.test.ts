import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { validateListingAttributes } from "@/modules/catalog/attributes";

const createdCategoryIds: string[] = [];

async function makeCategoryWithAttributes() {
  const category = await prisma.category.create({
    data: {
      slug: `attr-test-${Math.random().toString(36).slice(2)}`,
      nameAr: "قسم اختباري",
      nameEn: "Test Category",
      attributes: {
        create: [
          { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT", required: true, sortOrder: 0 },
          { key: "warranty", labelAr: "ضمان", labelEn: "Warranty", type: "BOOLEAN", sortOrder: 1 },
          {
            key: "condition",
            labelAr: "الحالة",
            labelEn: "Condition",
            type: "SELECT",
            options: [
              { value: "new", labelAr: "جديد", labelEn: "New" },
              { value: "used", labelAr: "مستعمل", labelEn: "Used" },
            ],
            sortOrder: 2,
          },
        ],
      },
    },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("validateListingAttributes", () => {
  afterEach(async () => {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    createdCategoryIds.length = 0;
  });

  it("accepts valid attributes matching the category's definitions", async () => {
    const category = await makeCategoryWithAttributes();
    const result = await validateListingAttributes(category.id, {
      brand: "Samsung",
      warranty: true,
      condition: "new",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ brand: "Samsung", warranty: true, condition: "new" });
  });

  it("rejects when a required field is missing", async () => {
    const category = await makeCategoryWithAttributes();
    const result = await validateListingAttributes(category.id, { warranty: true });
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("brand"))).toBe(true);
  });

  it("rejects a SELECT value outside the defined options", async () => {
    const category = await makeCategoryWithAttributes();
    const result = await validateListingAttributes(category.id, {
      brand: "Samsung",
      condition: "refurbished",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown attribute key not defined for the category (no smuggling extra fields)", async () => {
    const category = await makeCategoryWithAttributes();
    const result = await validateListingAttributes(category.id, {
      brand: "Samsung",
      hacked_field: "malicious",
    });
    expect(result.success).toBe(false);
  });

  it("treats non-required fields as optional", async () => {
    const category = await makeCategoryWithAttributes();
    const result = await validateListingAttributes(category.id, { brand: "Apple" });
    expect(result.success).toBe(true);
  });
});
