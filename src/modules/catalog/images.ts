import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { imageProcessingQueue } from "@/jobs/queues";
import { checkRateLimit } from "@/lib/rate-limit";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// A seller actively photographing/uploading across several listings in one
// session can plausibly hit 50-60 requests/hour; 60 gives headroom for that
// while stopping a script from minting unlimited presigned upload URLs — a
// real cost/abuse vector against the storage backend even before any file
// is ever uploaded. See docs/DECISIONS.md.
const IMAGE_UPLOAD_URL_RATE_LIMIT_MAX = 60;
const IMAGE_UPLOAD_URL_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

export interface RequestUploadResult {
  success: boolean;
  key?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  error?: "not_found" | "forbidden" | "invalid_content_type" | "rate_limited";
}

export async function requestImageUploadTarget(
  listingId: string,
  ownerId: string,
  contentType: string,
): Promise<RequestUploadResult> {
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return { success: false, error: "invalid_content_type" };
  }

  const allowed = await checkRateLimit(
    `ratelimit:image-upload-url:${ownerId}`,
    IMAGE_UPLOAD_URL_RATE_LIMIT_MAX,
    IMAGE_UPLOAD_URL_RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!allowed) {
    return { success: false, error: "rate_limited" };
  }

  const listing = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
  if (!listing) return { success: false, error: "not_found" };
  if (listing.ownerId !== ownerId) return { success: false, error: "forbidden" };

  const key = `listings/${listingId}/${randomUUID()}-original.${EXTENSION_BY_CONTENT_TYPE[contentType]}`;
  const target = await getStorageProvider().getUploadTarget(key, contentType);

  return { success: true, key, uploadUrl: target.url, headers: target.headers };
}

export interface ConfirmUploadResult {
  success: boolean;
  imageId?: string;
  error?: "not_found" | "forbidden";
}

export async function confirmImageUpload(
  listingId: string,
  ownerId: string,
  key: string,
): Promise<ConfirmUploadResult> {
  const listing = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
  if (!listing) return { success: false, error: "not_found" };
  if (listing.ownerId !== ownerId) return { success: false, error: "forbidden" };
  // The key must belong to this listing's own upload namespace — a client
  // can't point us at an arbitrary storage key it doesn't own.
  if (!key.startsWith(`listings/${listingId}/`)) return { success: false, error: "forbidden" };

  const sortOrder = await prisma.listingImage.count({ where: { listingId } });
  const image = await prisma.listingImage.create({
    data: { listingId, originalKey: key, sortOrder },
  });

  await imageProcessingQueue.add("process", { listingImageId: image.id, originalKey: key });

  return { success: true, imageId: image.id };
}

export async function deleteListingImage(imageId: string, ownerId: string): Promise<boolean> {
  const image = await prisma.listingImage.findUnique({
    where: { id: imageId },
    include: { listing: true },
  });
  if (!image || image.listing.ownerId !== ownerId) return false;

  await prisma.listingImage.delete({ where: { id: imageId } });
  return true;
}
