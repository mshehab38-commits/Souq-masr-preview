import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// Search already filters to status === "ACTIVE" at query time
// (PostgresSearchProvider), so flipping a listing to EXPIRED here is
// sufficient to remove it from search results — no re-indexing needed.
export async function sweepExpiredListings(now: Date = new Date()): Promise<number> {
  const result = await prisma.listing.updateMany({
    where: { status: "ACTIVE", deletedAt: null, expiresAt: { not: null, lt: now } },
    data: { status: "EXPIRED" },
  });

  if (result.count > 0) {
    logger.info("Swept expired listings", { count: result.count });
  }

  return result.count;
}
