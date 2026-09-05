import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { createNotification } from "@/modules/notifications/service";
import type { AccountDeletionRequestStatus } from "@prisma/client";

export type SubmitAccountDeletionRequestResult =
  | {
      success: true;
      request: Awaited<ReturnType<typeof prisma.accountDeletionRequest.create>>;
      alreadyPending: false;
    }
  | {
      success: true;
      request: NonNullable<Awaited<ReturnType<typeof prisma.accountDeletionRequest.findFirst>>>;
      alreadyPending: true;
    };

// A user with an already-PENDING request gets that same request back
// instead of creating a duplicate — the same dedupe shape as
// submitVerificationRequest. A user can never delete their own account
// directly; this only ever creates a request an admin must approve. See
// docs/DECISIONS.md (Phase 34).
export async function submitAccountDeletionRequest(
  userId: string,
  reason?: string,
): Promise<SubmitAccountDeletionRequestResult> {
  const existing = await prisma.accountDeletionRequest.findFirst({
    where: { userId, status: "PENDING" },
  });
  if (existing) return { success: true, request: existing, alreadyPending: true };

  const request = await prisma.accountDeletionRequest.create({
    data: { userId, reason },
  });
  return { success: true, request, alreadyPending: false };
}

// Structurally always tiny (a user has at most one PENDING request at a
// time, and realistically very few ever) — no pagination, same reasoning
// already documented for getVerificationRequests.
export async function getAccountDeletionRequests(userId: string) {
  return prisma.accountDeletionRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// Scoped by userId in the WHERE clause itself, matching deleteSavedSearch's
// ownership pattern. Only a still-PENDING request can be cancelled — once
// an admin has decided, the decision stands.
export async function cancelAccountDeletionRequest(id: string, userId: string): Promise<boolean> {
  const result = await prisma.accountDeletionRequest.deleteMany({
    where: { id, userId, status: "PENDING" },
  });
  return result.count > 0;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListAccountDeletionRequestsFilter {
  status?: AccountDeletionRequestStatus;
  page?: number;
  limit?: number;
}

// Admin queue — defaults to PENDING since that's what a reviewer actually
// needs to work through; pass status explicitly to see the rest.
export async function listAccountDeletionRequests(filter: ListAccountDeletionRequestsFilter) {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { status: filter.status ?? "PENDING" } as const;

  const [items, totalCount] = await Promise.all([
    prisma.accountDeletionRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.accountDeletionRequest.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

export type AccountDeletionDecision = "APPROVED" | "REJECTED";

export type ReviewAccountDeletionRequestResult =
  | { success: true }
  | { success: false; error: "not_found" | "already_reviewed" | "last_admin" };

// ADMIN-only — enforced by the caller. On APPROVED: permanently locks the
// account (User.deletedAt — already enforced with zero further code by
// getSessionUser, src/modules/identity/session.ts) and revokes every
// active session (the same defense-in-depth snippet setUserStatus already
// uses), then bulk-soft-deletes every listing the user owns and their
// store if they have one. Deliberately does NOT touch Order/LedgerEntry/
// Report/Notification/Favorite/SavedSearch rows — those are historical/
// financial records that must survive intact (CLAUDE.md Section 6); the
// product requirement is simply that the user can never log back in. On
// REJECTED: only the request row changes, no cascade. Refuses to approve
// deleting the sole remaining ADMIN account (same principle as
// setUserRole's last-admin guard) — an unrecoverable platform lockout,
// checked at approval time since a lone admin can still submit a request.
// Sentinel errors used only to trigger a clean transaction rollback from
// inside prisma.$transaction's callback (throwing aborts every write the
// callback made, including the claim below) — never leaked past this
// function. See the concurrency note on the updateMany claim for why a
// plain "check then separate transaction" shape is not used here.
class ClaimLostError extends Error {}
class LastAdminError extends Error {}

export async function reviewAccountDeletionRequest(
  requestId: string,
  actorId: string,
  decision: AccountDeletionDecision,
  notes?: string,
): Promise<ReviewAccountDeletionRequestResult> {
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request) return { success: false, error: "not_found" };
  if (request.status !== "PENDING") return { success: false, error: "already_reviewed" };

  try {
    await prisma.$transaction(async (tx) => {
      // Guarded by the status we actually read above, not just the id —
      // two concurrent review calls for the same request (an admin
      // double-click, a network retry, two admins racing) can both pass
      // the PENDING check above against the same stale read, but only one
      // can win this conditional update: the loser's WHERE no longer
      // matches once the winner's transaction commits (Postgres serializes
      // concurrent UPDATEs against the same row via row-level locking,
      // then re-evaluates WHERE against the now-committed data). Mirrors
      // the exact pattern src/modules/orders/transitions.ts already uses
      // for order-status races. This also makes the cascade below
      // naturally idempotent — a duplicate approval can never soft-delete
      // listings/store or revoke sessions twice, or record a duplicate
      // audit log entry or notification, since only the transaction that
      // wins the claim ever reaches those statements.
      const claim = await tx.accountDeletionRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: {
          status: decision,
          reviewedBy: actorId,
          reviewedAt: new Date(),
          notes: notes ?? request.notes,
        },
      });
      if (claim.count === 0) throw new ClaimLostError();

      if (decision === "APPROVED") {
        // Re-checked here, inside the same transaction that won the claim
        // above, not just from the pre-fetch — throwing (not returning)
        // guarantees the claim's status write above is rolled back too, so
        // a refused last-admin approval leaves the request genuinely
        // untouched (still PENDING), not silently marked APPROVED.
        const otherAdmins = await tx.user.count({
          where: { role: "ADMIN", deletedAt: null, id: { not: request.userId } },
        });
        if (request.user.role === "ADMIN" && otherAdmins === 0) throw new LastAdminError();

        await tx.user.update({ where: { id: request.userId }, data: { deletedAt: new Date() } });
        await tx.session.updateMany({
          where: { userId: request.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.listing.updateMany({
          where: { ownerId: request.userId, deletedAt: null },
          data: { status: "REMOVED", deletedAt: new Date() },
        });
        await tx.store.updateMany({
          where: { ownerId: request.userId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }
    });
  } catch (error) {
    if (error instanceof ClaimLostError) return { success: false, error: "already_reviewed" };
    if (error instanceof LastAdminError) return { success: false, error: "last_admin" };
    throw error;
  }

  await recordAudit({
    actorId,
    action: decision === "APPROVED" ? "admin.account_deletion.approve" : "admin.account_deletion.reject",
    targetType: "User",
    targetId: request.userId,
    metadata: { requestId },
  });

  await createNotification({
    userId: request.userId,
    type: "ACCOUNT_DELETION_REVIEWED",
    title: decision === "APPROVED" ? "تمت الموافقة على حذف حسابك" : "تم رفض طلب حذف حسابك",
    link: "/profile",
  });

  return { success: true };
}
