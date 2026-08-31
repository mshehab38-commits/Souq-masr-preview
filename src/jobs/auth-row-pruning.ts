import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// OtpCode/Session are never queried by expiresAt at the DB level —
// verifyOtp/getSessionUser fetch then reject expired rows in application
// code, so an expired row here is already fully inert. Deleting (not
// updating to a terminal status) is safe: unlike Listing/ListingImage,
// nothing reads these rows for history once expired (recordAudit logs
// auth events separately, with no FK to Session).
export async function pruneExpiredAuthRows(
  now: Date = new Date(),
): Promise<{ otpCodes: number; sessions: number }> {
  const [otpResult, sessionResult] = await Promise.all([
    prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  if (otpResult.count > 0 || sessionResult.count > 0) {
    logger.info("Pruned expired auth rows", { otpCodes: otpResult.count, sessions: sessionResult.count });
  }

  return { otpCodes: otpResult.count, sessions: sessionResult.count };
}
