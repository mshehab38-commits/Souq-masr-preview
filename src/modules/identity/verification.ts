import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import type { VerificationRequestType, VerificationRequestStatus } from "@prisma/client";

export async function submitVerificationRequest(
  userId: string,
  type: VerificationRequestType,
  data: { businessName?: string; notes?: string },
) {
  return prisma.verificationRequest.create({
    data: {
      userId,
      type,
      businessName: data.businessName,
      notes: data.notes,
    },
  });
}

export async function getVerificationRequests(userId: string) {
  return prisma.verificationRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListVerificationRequestsFilter {
  status?: VerificationRequestStatus;
  page?: number;
  limit?: number;
}

// Admin/moderator queue — defaults to PENDING since that's what a reviewer
// actually needs to work through; pass status explicitly to see the rest.
export async function listVerificationRequests(filter: ListVerificationRequestsFilter) {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { status: filter.status ?? "PENDING" } as const;

  const [items, totalCount] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, name: true, phone: true, role: true } } },
    }),
    prisma.verificationRequest.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

export type VerificationDecision = "APPROVED" | "REJECTED";

// ADMIN/MODERATOR — enforced by the caller. On approval: stamps
// `commerceVerifiedAt` (the field commerce-eligibility already reads) and,
// only for a still-INDIVIDUAL user, promotes `role` to BUSINESS for a
// BUSINESS-type request. Never touches ADMIN/MODERATOR roles. Refuses to
// re-review a request that's already been decided.
export async function reviewVerificationRequest(
  requestId: string,
  actorId: string,
  decision: VerificationDecision,
  notes?: string,
): Promise<{ success: true } | { success: false; error: "not_found" | "already_reviewed" }> {
  const request = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request) return { success: false, error: "not_found" };
  if (request.status !== "PENDING") return { success: false, error: "already_reviewed" };

  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: decision,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        notes: notes ?? request.notes,
      },
    });

    if (decision === "APPROVED") {
      await tx.user.update({
        where: { id: request.userId },
        data: {
          commerceVerifiedAt: new Date(),
          ...(request.type === "BUSINESS" && request.user.role === "INDIVIDUAL"
            ? { role: "BUSINESS" as const }
            : {}),
        },
      });
    }
  });

  await recordAudit({
    actorId,
    action: decision === "APPROVED" ? "admin.verification.approve" : "admin.verification.reject",
    targetType: "VerificationRequest",
    targetId: requestId,
    metadata: { userId: request.userId, type: request.type },
  });

  return { success: true };
}
