import sharp from "sharp";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { logger } from "@/lib/logger";

export interface ImageProcessingJobData {
  listingImageId: string;
  originalKey: string;
}

const MAGIC_BYTE_SIGNATURES: Array<{ mime: string; matches: (buf: Buffer) => boolean }> = [
  { mime: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/webp",
    matches: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

// Never trust a client-supplied Content-Type — verify the real file
// signature before doing anything with the uploaded bytes.
export function detectImageMime(buffer: Buffer): string | null {
  return MAGIC_BYTE_SIGNATURES.find((sig) => sig.matches(buffer))?.mime ?? null;
}

const VARIANTS = [
  { name: "thumbnail", width: 300 },
  { name: "medium", width: 800 },
  { name: "full", width: 1600 },
] as const;

export async function processListingImage(data: ImageProcessingJobData): Promise<void> {
  const storage = getStorageProvider();
  const original = await storage.getObject(data.originalKey);

  if (!detectImageMime(original)) {
    await prisma.listingImage.update({
      where: { id: data.listingImageId },
      data: { status: "REJECTED" },
    });
    logger.warn("Rejected upload: not a recognized image format", {
      listingImageId: data.listingImageId,
    });
    return;
  }

  const baseKey = data.originalKey.replace(/\.[^./]+$/, "");
  const variantUrls: Record<string, string> = {};

  for (const variant of VARIANTS) {
    // .rotate() applies EXIF orientation before sharp's re-encode drops the
    // EXIF block entirely (withMetadata() is deliberately never called, so
    // GPS/EXIF never survives into a stored variant).
    const resized = await sharp(original)
      .rotate()
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const key = `${baseKey}-${variant.name}.webp`;
    await storage.putObject(key, resized, "image/webp");
    variantUrls[variant.name] = storage.getPublicUrl(key);
  }

  await prisma.listingImage.update({
    where: { id: data.listingImageId },
    data: {
      thumbnailUrl: variantUrls.thumbnail,
      mediumUrl: variantUrls.medium,
      fullUrl: variantUrls.full,
      // No moderation pipeline exists yet (Phase 9) — mark ready immediately
      // once processed rather than leaving it pending forever.
      status: "READY",
    },
  });
}
