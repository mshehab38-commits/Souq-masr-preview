import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { recordAudit } from "@/lib/audit";
import { adminRemoveListing, flagListingForReview, decidePendingListing as decidePendingListingInCatalog } from "@/modules/catalog/service";
import { setUserStatus } from "@/modules/identity/service";
import { createNotification } from "@/modules/notifications/service";
import type { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Mirrors the OTP rate limiter's shape (src/modules/identity/otp.ts) — a
// per-reporter sliding window in Redis. Generous enough not to interfere
// with a legitimately active user, tight enough to stop the "spam reports
// against many different targets" gap the dedupe check alone doesn't
// cover (see docs/DECISIONS.md).
const MAX_REPORTS_PER_WINDOW = 20;
const REPORT_RATE_WINDOW_SECONDS = 60 * 60;

export type CreateReportInput =
  | { targetType: "LISTING"; listingId: string; reason: ReportReason; details?: string }
  | { targetType: "USER"; targetUserId: string; reason: ReportReason; details?: string };

export type CreateReportResult =
  | { success: true; report: Awaited<ReturnType<typeof prisma.report.create>>; alreadyOpen: false }
  | { success: true; report: Awaited<ReturnType<typeof prisma.report.findFirst>>; alreadyOpen: true }
  | { success: false; error: "target_not_found" | "cannot_report_self" | "rate_limited" };

// Any authenticated user. Enforces the same mutual-exclusivity the
// database CHECK constraint enforces (fail with a clear application error
// before ever reaching the DB), and dedupes: a second OPEN report by the
// same reporter against the same target returns the existing one instead
// of creating a duplicate. Also rate-limited per reporter (below) — the
// dedupe alone doesn't stop spamming reports against many *different*
// targets.
export async function createReport(
  reporterId: string,
  input: CreateReportInput,
): Promise<CreateReportResult> {
  const rateKey = `reports:rate:${reporterId}`;
  const recentCount = await redis.get(rateKey);
  if (Number(recentCount ?? 0) >= MAX_REPORTS_PER_WINDOW) {
    return { success: false, error: "rate_limited" };
  }

  if (input.targetType === "LISTING") {
    const listing = await prisma.listing.findUnique({
      where: { id: input.listingId },
      select: { id: true, deletedAt: true },
    });
    if (!listing || listing.deletedAt) return { success: false, error: "target_not_found" };

    const existing = await prisma.report.findFirst({
      where: { reporterId, listingId: input.listingId, status: "OPEN" },
    });
    if (existing) return { success: true, report: existing, alreadyOpen: true };

    const report = await prisma.report.create({
      data: {
        reporterId,
        targetType: "LISTING",
        listingId: input.listingId,
        reason: input.reason,
        details: input.details,
      },
    });
    await redis.multi().incr(rateKey).expire(rateKey, REPORT_RATE_WINDOW_SECONDS).exec();
    return { success: true, report, alreadyOpen: false };
  }

  if (input.targetUserId === reporterId) return { success: false, error: "cannot_report_self" };

  const targetUser = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, deletedAt: true },
  });
  if (!targetUser || targetUser.deletedAt) return { success: false, error: "target_not_found" };

  const existing = await prisma.report.findFirst({
    where: { reporterId, targetUserId: input.targetUserId, status: "OPEN" },
  });
  if (existing) return { success: true, report: existing, alreadyOpen: true };

  const report = await prisma.report.create({
    data: {
      reporterId,
      targetType: "USER",
      targetUserId: input.targetUserId,
      reason: input.reason,
      details: input.details,
    },
  });
  await redis.multi().incr(rateKey).expire(rateKey, REPORT_RATE_WINDOW_SECONDS).exec();
  return { success: true, report, alreadyOpen: false };
}

export interface ListReportsFilter {
  status?: ReportStatus;
  targetType?: ReportTargetType;
  page?: number;
  limit?: number;
}

// Moderator queue — defaults to OPEN, matching listVerificationRequests'
// "show me the work" default.
export async function listReports(filter: ListReportsFilter) {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = {
    status: filter.status ?? "OPEN",
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        reporter: { select: { id: true, name: true, phone: true } },
        listing: { select: { id: true, title: true, status: true } },
        targetUser: { select: { id: true, name: true, phone: true, status: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

export type ReportResolution =
  | { decision: "DISMISS"; notes?: string }
  | { decision: "ACTION_TAKEN"; action?: "REMOVE_LISTING" | "SUSPEND_USER" | "FLAG_FOR_REVIEW"; notes?: string };

// Moderator/admin. Performs the requested action first (if any) and only
// marks the report resolved once it succeeds, so a failed action leaves
// the report OPEN for retry rather than silently closing it. Refuses to
// resolve a report that's already been resolved.
//
// NOTE: this function does not itself gate `action: "SUSPEND_USER"` to
// ADMIN — `setUserStatus` is ADMIN-only by convention, enforced at the API
// route boundary like every other admin action in this codebase. The
// `PATCH /api/admin/reports/[id]` route requires `requireAdmin()`
// specifically before allowing `SUSPEND_USER`, while `REMOVE_LISTING` and
// `DISMISS` only require `requireModerator()`.
export async function resolveReport(
  reportId: string,
  moderatorId: string,
  resolution: ReportResolution,
): Promise<{ success: true } | { success: false; error: "not_found" | "already_resolved" | "action_failed" }> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { listing: { select: { ownerId: true, title: true } } },
  });
  if (!report) return { success: false, error: "not_found" };
  if (report.status !== "OPEN") return { success: false, error: "already_resolved" };

  if (resolution.decision === "ACTION_TAKEN" && resolution.action) {
    const actionSucceeded =
      resolution.action === "REMOVE_LISTING"
        ? Boolean(report.listingId) && (await adminRemoveListing(report.listingId as string, moderatorId))
        : resolution.action === "FLAG_FOR_REVIEW"
          ? Boolean(report.listingId) && (await flagListingForReview(report.listingId as string, moderatorId))
          : Boolean(report.targetUserId) &&
            (await setUserStatus(report.targetUserId as string, "SUSPENDED", moderatorId));
    if (!actionSucceeded) return { success: false, error: "action_failed" };
  }

  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: resolution.decision === "DISMISS" ? "DISMISSED" : "ACTION_TAKEN",
      reviewedById: moderatorId,
      reviewedAt: new Date(),
      resolutionNotes: resolution.notes,
    },
  });

  await recordAudit({
    actorId: moderatorId,
    action: "admin.report.resolve",
    targetType: "Report",
    targetId: reportId,
    metadata: {
      decision: resolution.decision,
      action: resolution.decision === "ACTION_TAKEN" ? resolution.action : undefined,
      listingId: report.listingId ?? undefined,
      targetUserId: report.targetUserId ?? undefined,
    },
  });

  await createNotification({
    userId: report.reporterId,
    type: "REPORT_RESOLVED",
    title: resolution.decision === "DISMISS" ? "تم مراجعة بلاغك ولم يُتخذ إجراء" : "تم مراجعة بلاغك واتخاذ إجراء",
  });

  // The listing owner learns their listing was removed or flagged
  // regardless of who reported it — but a suspended/banned user isn't
  // notified (their session is already revoked and they can't act on it).
  if (resolution.decision === "ACTION_TAKEN" && resolution.action === "REMOVE_LISTING" && report.listing) {
    await createNotification({
      userId: report.listing.ownerId,
      type: "LISTING_REMOVED",
      title: `تمت إزالة إعلانك "${report.listing.title}"`,
      body: "تمت إزالة هذا الإعلان لمخالفته سياسات المنصة",
    });
  }
  if (resolution.decision === "ACTION_TAKEN" && resolution.action === "FLAG_FOR_REVIEW" && report.listing) {
    await createNotification({
      userId: report.listing.ownerId,
      type: "LISTING_FLAGGED_FOR_REVIEW",
      title: `تم إيقاف إعلانك "${report.listing.title}" مؤقتًا للمراجعة`,
      body: "سيتم إعلامك بقرار المراجعة قريبًا",
    });
  }

  return { success: true };
}

export type DecidePendingListingResult =
  | { success: true }
  | { success: false; error: "not_found" };

// Standalone moderator action off the pending-review queue — distinct from
// resolveReport since a flagged listing isn't necessarily tied to the report
// that flagged it by the time it's decided (multiple reports can flag the
// same listing; the queue works off the listing's own status).
export async function decidePendingListing(
  listingId: string,
  moderatorId: string,
  decision: "APPROVE" | "REJECT",
): Promise<DecidePendingListingResult> {
  const listing = await decidePendingListingInCatalog(listingId, decision);
  if (!listing) return { success: false, error: "not_found" };

  await recordAudit({
    actorId: moderatorId,
    action: decision === "APPROVE" ? "admin.listing.review_approve" : "admin.listing.review_reject",
    targetType: "Listing",
    targetId: listingId,
  });

  await createNotification({
    userId: listing.ownerId,
    type: "LISTING_REVIEW_DECIDED",
    title:
      decision === "APPROVE"
        ? `تمت الموافقة على إعلانك "${listing.title}" وهو الآن نشط`
        : `تم رفض إعلانك "${listing.title}" بعد المراجعة`,
  });

  return { success: true };
}
