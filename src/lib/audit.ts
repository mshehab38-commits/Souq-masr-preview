import { prisma } from "@/lib/db";
import type { AuditActorType, Prisma } from "@prisma/client";

interface RecordAuditInput {
  actorId?: string;
  actorType?: AuditActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(input: RecordAuditInput) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      actorType: input.actorType ?? "USER",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

const AUDIT_LOG_DEFAULT_LIMIT = 20;
const AUDIT_LOG_MAX_LIMIT = 100;

export interface AuditLogFilter {
  action?: string;
  targetType?: string;
  page?: number;
  limit?: number;
}

// The read counterpart of recordAudit() above — lives in the same file
// since AuditLog has no owning module (it's a cross-cutting concern like
// the rest of src/lib), matching how recordAudit is already imported
// directly from every module and route. `action` is a substring match
// (case-insensitive) rather than exact, since several real action
// strings are dynamically built (e.g. `listing.bulk.${action}`,
// `order.transition.${targetStatus}`, `store.branding.${kind}`) and an
// exact-match filter would never find them.
export async function listAuditLogs(filter: AuditLogFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || AUDIT_LOG_DEFAULT_LIMIT, 1), AUDIT_LOG_MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = {
    ...(filter.action ? { action: { contains: filter.action, mode: "insensitive" as const } } : {}),
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}
