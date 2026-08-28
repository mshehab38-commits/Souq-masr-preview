import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveCommerceEligibility } from "@/modules/catalog/commerceEligibility";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser(commerceVerified: boolean) {
  const user = await prisma.user.create({
    data: {
      phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      commerceVerifiedAt: commerceVerified ? new Date() : null,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory(commerceDefault: "ELIGIBLE" | "NOT_ELIGIBLE" | "ADMIN_REVIEW") {
  const category = await prisma.category.create({
    data: {
      slug: `test-cat-${Math.random().toString(36).slice(2)}`,
      nameAr: "قسم اختباري",
      nameEn: "Test Category",
      commerceDefault,
    },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("resolveCommerceEligibility", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("is not eligible when the category default is NOT_ELIGIBLE, regardless of seller verification", async () => {
    const category = await makeCategory("NOT_ELIGIBLE");
    const seller = await makeUser(true);

    const result = await resolveCommerceEligibility(seller.id, category.id);
    expect(result).toEqual({ eligible: false, reason: "category_not_eligible" });
  });

  it("is not eligible when the category is ADMIN_REVIEW and no override exists yet", async () => {
    const category = await makeCategory("ADMIN_REVIEW");
    const seller = await makeUser(true);

    const result = await resolveCommerceEligibility(seller.id, category.id);
    expect(result).toEqual({ eligible: false, reason: "category_not_eligible" });
  });

  it("is not eligible for an ELIGIBLE category when the seller is not commerce-verified", async () => {
    const category = await makeCategory("ELIGIBLE");
    const seller = await makeUser(false);

    const result = await resolveCommerceEligibility(seller.id, category.id);
    expect(result).toEqual({ eligible: false, reason: "seller_not_verified" });
  });

  it("is eligible for a verified individual seller in an ELIGIBLE category — not business-exclusive", async () => {
    const category = await makeCategory("ELIGIBLE");
    const seller = await makeUser(true);
    expect(seller.role).toBe("INDIVIDUAL");

    const result = await resolveCommerceEligibility(seller.id, category.id);
    expect(result).toEqual({
      eligible: true,
      allowedFulfillmentModes: ["SELF_ARRANGED", "PLATFORM_SHIPPING", "SELLER_DELIVERY"],
    });
  });

  it("returns category_not_found for a missing category", async () => {
    const seller = await makeUser(true);
    const result = await resolveCommerceEligibility(seller.id, "does-not-exist");
    expect(result).toEqual({ eligible: false, reason: "category_not_found" });
  });
});
