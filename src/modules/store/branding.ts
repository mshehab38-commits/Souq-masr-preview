import sharp from "sharp";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { detectImageMime } from "@/jobs/image-processing";

// Branding images (logo/cover) are small, low-volume, and needed
// immediately for the settings page to reflect the change — unlike listing
// photos there's no need for multiple size variants or an async queue, so
// this resizes synchronously in the request instead of going through
// BullMQ. Still shares the same never-trust-the-client-Content-Type check
// and EXIF-stripping behavior as the listing-image pipeline (rotate() then
// re-encode without withMetadata()).
const BRANDING_DIMENSIONS = {
  logo: { width: 400, height: 400 },
  cover: { width: 1600, height: 500 },
} as const;

export type BrandingKind = keyof typeof BRANDING_DIMENSIONS;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type UploadBrandingResult =
  | { success: true; url: string }
  | { success: false; error: "not_found" | "invalid_image" | "too_large" };

export async function uploadStoreBranding(
  ownerId: string,
  kind: BrandingKind,
  buffer: Buffer,
): Promise<UploadBrandingResult> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return { success: false, error: "too_large" };

  const store = await prisma.store.findFirst({ where: { ownerId, deletedAt: null } });
  if (!store) return { success: false, error: "not_found" };

  if (!detectImageMime(buffer)) return { success: false, error: "invalid_image" };

  const dimensions = BRANDING_DIMENSIONS[kind];
  const resized = await sharp(buffer)
    .rotate()
    .resize({ width: dimensions.width, height: dimensions.height, fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();

  const storage = getStorageProvider();
  const key = `stores/${store.id}/${kind}-${Date.now()}.webp`;
  await storage.putObject(key, resized, "image/webp");
  const url = storage.getPublicUrl(key);

  await prisma.store.update({
    where: { id: store.id },
    data: kind === "logo" ? { logoUrl: url } : { coverUrl: url },
  });

  return { success: true, url };
}
