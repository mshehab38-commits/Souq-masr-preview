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

// branding.ts has had an equivalent MAX_UPLOAD_BYTES check since Phase 4;
// listing images never got one. Checked via getObjectSize() before ever
// calling getObject() — loading an oversized buffer into memory (to then
// reject it) would already be the memory-exhaustion problem this guards
// against, since the worker runs at concurrency 4.
const MAX_LISTING_IMAGE_BYTES = 15 * 1024 * 1024;

// Every write in this function is guarded on the row still being PENDING —
// via updateMany rather than update, matching this codebase's established
// guarded-write pattern elsewhere (order transitions, checkout's listing
// reservation). This closes a real race with listing-image-sweep.ts: if the
// whole worker process is down for over an hour with a backlog of
// never-yet-attempted image-processing jobs, the sweep's cutoff can flip a
// row to REJECTED before its backlogged job finally runs — without this
// guard, that job would then unconditionally overwrite the sweep's decision
// back to READY/REJECTED. A no-op updateMany (0 rows matched) leaves the
// sweep's REJECTED verdict standing, which is the correct outcome. See
// docs/DECISIONS.md.
export async function processListingImage(data: ImageProcessingJobData): Promise<void> {
  const storage = getStorageProvider();

  const size = await storage.getObjectSize(data.originalKey);
  if (size > MAX_LISTING_IMAGE_BYTES) {
    await prisma.listingImage.updateMany({
      where: { id: data.listingImageId, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    logger.warn("Rejected upload: exceeds max size", { listingImageId: data.listingImageId, size });
    return;
  }

  const original = await storage.getObject(data.originalKey);

  if (!detectImageMime(original)) {
    await prisma.listingImage.updateMany({
      where: { id: data.listingImageId, status: "PENDING" },
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

  await prisma.listingImage.updateMany({
    where: { id: data.listingImageId, status: "PENDING" },
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
