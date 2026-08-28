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
