import { afterEach, describe, expect, it, vi } from "vitest";
import { detectImageMime, processListingImage } from "@/jobs/image-processing";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

describe("detectImageMime", () => {
  it("recognizes a JPEG signature", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMime(buf)).toBe("image/jpeg");
  });

  it("recognizes a PNG signature", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMime(buf)).toBe("image/png");
  });

  it("recognizes a WebP (RIFF/WEBP) signature", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(detectImageMime(buf)).toBe("image/webp");
  });

  it("rejects a file whose bytes don't match any known image signature — a client-supplied Content-Type is never trusted", () => {
    const disguisedScript = Buffer.from("<?php system($_GET['c']); ?>", "ascii");
    expect(detectImageMime(disguisedScript)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("processListingImage", () => {
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdListingIds: string[] = [];

  afterEach(async () => {
    await prisma.listingImage.deleteMany({ where: { listingId: { in: createdListingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: createdListingIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
    createdListingIds.length = 0;
  });

  it("rejects an oversized upload without ever loading it into memory", async () => {
    const owner = await prisma.user.create({
      data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
    });
    createdUserIds.push(owner.id);
    const category = await prisma.category.create({
      data: { slug: `img-size-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
    });
    createdCategoryIds.push(category.id);
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان" },
    });
    createdListingIds.push(listing.id);
    const image = await prisma.listingImage.create({
      data: { listingId: listing.id, originalKey: `listings/${listing.id}/original.jpg` },
    });

    const storage = getStorageProvider();
    const sizeSpy = vi.spyOn(storage, "getObjectSize").mockResolvedValueOnce(16 * 1024 * 1024);
    const getObjectSpy = vi.spyOn(storage, "getObject");

    await processListingImage({ listingImageId: image.id, originalKey: image.originalKey });

    expect(getObjectSpy).not.toHaveBeenCalled();
    const updated = await prisma.listingImage.findUniqueOrThrow({ where: { id: image.id } });
    expect(updated.status).toBe("REJECTED");

    sizeSpy.mockRestore();
    getObjectSpy.mockRestore();
  });
});
