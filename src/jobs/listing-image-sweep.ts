import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

// processListingImage has no catch block — a thrown error (storage
// failure, sharp() throwing on a corrupt file) propagates to BullMQ,
// which retries 3x then just marks the job failed, never touching
// ListingImage.status. This sweep is the backstop: anything still
// PENDING well past when processing should have finished (attempts:3
// with exponential backoff resolves in well under a minute) is treated
// as permanently failed, not "still processing."
export async function sweepStuckListingImages(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const result = await prisma.listingImage.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "REJECTED" },
  });

  if (result.count > 0) {
    logger.info("Swept stuck listing images", { count: result.count });
  }

  return result.count;
}
