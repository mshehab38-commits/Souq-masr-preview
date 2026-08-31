import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sweepStuckListingImages } from "@/jobs/listing-image-sweep";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdListingIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `img-sweep-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeListing(ownerId: string, categoryId: string) {
  const listing = await prisma.listing.create({
    data: { ownerId, categoryId, title: "إعلان به صورة" },
  });
  createdListingIds.push(listing.id);
  return listing;
}

async function makeImage(listingId: string, overrides: Record<string, unknown> = {}) {
  return prisma.listingImage.create({
    data: { listingId, originalKey: `listings/${listingId}/original.jpg`, ...overrides },
  });
}

describe("sweepStuckListingImages", () => {
  afterEach(async () => {
    await prisma.listingImage.deleteMany({ where: { listingId: { in: createdListingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: createdListingIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
    createdListingIds.length = 0;
  });

  it("flips a PENDING image older than the stale cutoff to REJECTED", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);
    const image = await makeImage(listing.id, {
      status: "PENDING",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const count = await sweepStuckListingImages();
    expect(count).toBeGreaterThanOrEqual(1);

    const updated = await prisma.listingImage.findUniqueOrThrow({ where: { id: image.id } });
    expect(updated.status).toBe("REJECTED");
  });

  it("does not touch a PENDING image still within the stale window", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);
    const image = await makeImage(listing.id, { status: "PENDING" });

    await sweepStuckListingImages();

    const updated = await prisma.listingImage.findUniqueOrThrow({ where: { id: image.id } });
    expect(updated.status).toBe("PENDING");
  });

  it("does not touch a READY image even if it's old", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);
    const image = await makeImage(listing.id, {
      status: "READY",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    await sweepStuckListingImages();

    const updated = await prisma.listingImage.findUniqueOrThrow({ where: { id: image.id } });
    expect(updated.status).toBe("READY");
  });
});
