import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sweepExpiredListings } from "@/jobs/listing-expiry";

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
    data: { slug: `expiry-test-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("sweepExpiredListings", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("flips an ACTIVE listing past its expiresAt to EXPIRED", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: category.id,
        title: "منتهي",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const count = await sweepExpiredListings();
    expect(count).toBeGreaterThanOrEqual(1);

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("EXPIRED");
  });

  it("does not touch an ACTIVE listing whose expiresAt is still in the future", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: category.id,
        title: "لم ينته بعد",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await sweepExpiredListings();

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("ACTIVE");
  });

  it("does not touch a listing with no expiresAt set", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "بدون تاريخ انتهاء", status: "ACTIVE" },
    });

    await sweepExpiredListings();

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("ACTIVE");
  });

  it("does not touch a SOLD listing even if its expiresAt has passed", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: category.id,
        title: "مباع بالفعل",
        status: "SOLD",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await sweepExpiredListings();

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("SOLD");
  });
});
