import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requestImageUploadTarget } from "@/modules/catalog/images";

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
    data: { slug: `images-test-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function makeListing(ownerId: string, categoryId: string) {
  return prisma.listing.create({
    data: { ownerId, categoryId, title: "إعلان اختباري", status: "ACTIVE" },
  });
}

describe("requestImageUploadTarget", () => {
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await redis.del(...createdUserIds.map((id) => `ratelimit:image-upload-url:${id}`));
    }
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
  });

  it("issues an upload target for the listing owner", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);

    const result = await requestImageUploadTarget(listing.id, owner.id, "image/jpeg");
    expect(result.success).toBe(true);
    expect(result.key).toMatch(new RegExp(`^listings/${listing.id}/`));
    expect(result.uploadUrl).toBeTruthy();
  });

  it("rejects a disallowed content type", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);

    const result = await requestImageUploadTarget(listing.id, owner.id, "application/pdf");
    expect(result).toEqual({ success: false, error: "invalid_content_type" });
  });

  it("rejects a non-owner", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);

    const result = await requestImageUploadTarget(listing.id, stranger.id, "image/jpeg");
    expect(result).toEqual({ success: false, error: "forbidden" });
  });

  it("rate-limits upload-URL requests after 60 within the window, per owner", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await makeListing(owner.id, category.id);

    for (let i = 0; i < 60; i++) {
      const result = await requestImageUploadTarget(listing.id, owner.id, "image/jpeg");
      expect(result.success).toBe(true);
    }

    const rateLimited = await requestImageUploadTarget(listing.id, owner.id, "image/jpeg");
    expect(rateLimited).toEqual({ success: false, error: "rate_limited" });
  });
});
