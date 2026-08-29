import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { adminRemoveListing } from "@/modules/catalog/listings";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `admin-rm-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("adminRemoveListing", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("removes a listing regardless of who owns it — no ownerId scoping", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان مخالف", status: "ACTIVE" },
    });

    const removed = await adminRemoveListing(listing.id);
    expect(removed).toBe(true);

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("REMOVED");
    expect(updated.deletedAt).not.toBeNull();
  });

  it("returns false for a listing that's already removed", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: category.id,
        title: "إعلان محذوف مسبقاً",
        status: "REMOVED",
        deletedAt: new Date(),
      },
    });

    expect(await adminRemoveListing(listing.id)).toBe(false);
  });

  it("returns false for a nonexistent listing", async () => {
    expect(await adminRemoveListing("does-not-exist")).toBe(false);
  });
});
