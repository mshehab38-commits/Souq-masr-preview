import { prisma } from "@/lib/db";
import type { PaymentFeeBearer, PlatformSettings } from "@prisma/client";
import { recordAudit } from "@/lib/audit";

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

// Self-audits with the prior values for every key present in `input`
// (audit inside the function that holds the authority, mirroring the
// Phase 23 pattern in identity/admin-users.ts's setUserStatus) — the
// route used to record only the submitted `input` as metadata, so
// "what did this change from" was unreconstructable from AuditLog
// alone. See docs/DECISIONS.md.
export async function updatePlatformSettings(
  adminUserId: string,
  input: UpdatePlatformSettingsInput,
): Promise<PlatformSettings> {
  const before = await getPlatformSettings();
  const from = Object.fromEntries(Object.keys(input).map((key) => [key, before[key as keyof PlatformSettings]]));

  const settings = await prisma.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { ...input, updatedBy: adminUserId },
    create: { id: SINGLETON_ID, ...input, updatedBy: adminUserId },
  });

  await recordAudit({
    actorId: adminUserId,
    action: "settings.update",
    targetType: "PlatformSettings",
    metadata: { from, to: input },
  });

  return settings;
}
