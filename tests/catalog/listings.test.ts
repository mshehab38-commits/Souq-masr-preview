import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createListing } from "@/modules/catalog/listings";
import { updatePlatformSettings } from "@/modules/settings/settings";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ...overrides },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `create-listing-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("createListing", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.platformSettings.updateMany({
      where: { id: "singleton" },
      data: { freeListingActiveLimit: null },
    });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("creates an ACTIVE listing when no limit is configured (fails open)", async () => {
    const owner = await makeUser();
    const category = await makeCategory();

    const result = await createListing(owner.id, { categoryId: category.id, title: "دراجة للبيع" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: result.listingId } });
    expect(listing.status).toBe("ACTIVE");
    expect(listing.ownerId).toBe(owner.id);
  });

  it("rejects with listing_limit_reached once the owner's active-listing cap is met", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const owner = await makeUser();
    const category = await makeCategory();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 1 });

    const first = await createListing(owner.id, { categoryId: category.id, title: "إعلان أول" });
    expect(first.success).toBe(true);

    const second = await createListing(owner.id, { categoryId: category.id, title: "إعلان ثاني" });
    expect(second).toEqual({ success: false, error: "listing_limit_reached", limit: 1 });
  });

  it("under two concurrent creates against a limit of one, exactly one succeeds", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const owner = await makeUser();
    const category = await makeCategory();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 1 });

    const [resultA, resultB] = await Promise.all([
      createListing(owner.id, { categoryId: category.id, title: "إعلان أ" }),
      createListing(owner.id, { categoryId: category.id, title: "إعلان ب" }),
    ]);

    const results = [resultA, resultB];
    const wins = results.filter((r) => r.success);
    const losses = results.filter((r) => !r.success);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({ success: false, error: "listing_limit_reached" });

    const activeCount = await prisma.listing.count({ where: { ownerId: owner.id, status: "ACTIVE" } });
    expect(activeCount).toBe(1);
  });
});
