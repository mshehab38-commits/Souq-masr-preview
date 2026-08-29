import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { adminRemoveListing } from "@/modules/catalog/service";
import { setUserStatus } from "@/modules/identity/service";
import type { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type CreateReportInput =
  | { targetType: "LISTING"; listingId: string; reason: ReportReason; details?: string }
  | { targetType: "USER"; targetUserId: string; reason: ReportReason; details?: string };

export type CreateReportResult =
  | { success: true; report: Awaited<ReturnType<typeof prisma.report.create>>; alreadyOpen: false }
  | { success: true; report: Awaited<ReturnType<typeof prisma.report.findFirst>>; alreadyOpen: true }
  | { success: false; error: "target_not_found" | "cannot_report_self" };

// Any authenticated user. Enforces the same mutual-exclusivity the
// database CHECK constraint enforces (fail with a clear application error
// before ever reaching the DB), and dedupes: a second OPEN report by the
// same reporter against the same target returns the existing one instead
// of creating a duplicate — the primary anti-abuse measure for this phase.
export async function createReport(
  reporterId: string,
  input: CreateReportInput,
): Promise<CreateReportResult> {
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
  | { decision: "ACTION_TAKEN"; action?: "REMOVE_LISTING" | "SUSPEND_USER"; notes?: string };

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
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return { success: false, error: "not_found" };
  if (report.status !== "OPEN") return { success: false, error: "already_resolved" };

  if (resolution.decision === "ACTION_TAKEN" && resolution.action) {
    const actionSucceeded =
      resolution.action === "REMOVE_LISTING"
        ? Boolean(report.listingId) && (await adminRemoveListing(report.listingId as string))
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
    metadata: { decision: resolution.decision, action: resolution.decision === "ACTION_TAKEN" ? resolution.action : undefined },
  });

  return { success: true };
}
