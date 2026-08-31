import { prisma } from "@/lib/db";
import type { PaymentFeeBearer, PlatformSettings } from "@prisma/client";

const SINGLETON_ID = "singleton";

// The settings row is created lazily on first read with every financial
// field null (OWNER CONFIGURATION REQUIRED) rather than seeded with
// invented defaults — see prisma/schema.prisma's PlatformSettings comment.
export async function getPlatformSettings(): Promise<PlatformSettings> {
  return prisma.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

export interface UpdatePlatformSettingsInput {
  freeListingActiveLimit?: number | null;
  paymentProcessingFeeBearer?: PaymentFeeBearer | null;
  requirePrePublishReview?: boolean;
}

export async function updatePlatformSettings(
  adminUserId: string,
  input: UpdatePlatformSettingsInput,
): Promise<PlatformSettings> {
  return prisma.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { ...input, updatedBy: adminUserId },
    create: { id: SINGLETON_ID, ...input, updatedBy: adminUserId },
  });
}
