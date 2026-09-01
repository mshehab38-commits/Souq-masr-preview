import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import type { UserRole, UserStatus } from "@prisma/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListUsersFilter {
  query?: string;
  status?: UserStatus;
  role?: UserRole;
  page?: number;
  limit?: number;
}

export interface ListUsersResult {
  items: Awaited<ReturnType<typeof prisma.user.findMany>>;
  page: number;
  totalPages: number;
  totalCount: number;
}

export async function listUsers(filter: ListUsersFilter): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);

  const where = {
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.query
      ? {
          OR: [
            { phone: { contains: filter.query, mode: "insensitive" as const } },
            { name: { contains: filter.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

// Scoped to exactly the fields the admin user-detail page reads
// (src/app/admin/users/[id]/UserDetail.tsx) — an unscoped findUnique
// would over-fetch and serialize low-sensitivity but unused fields
// (email, phoneVerifiedAt, deletedAt, updatedAt) into the API response.
export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      commerceVerifiedAt: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const [listingCount, buyerOrderCount, sellerOrderCount, reportsMadeCount, reportsReceivedCount] =
    await Promise.all([
      prisma.listing.count({ where: { ownerId: userId, deletedAt: null } }),
      prisma.order.count({ where: { buyerId: userId } }),
      prisma.order.count({ where: { sellerId: userId } }),
      prisma.report.count({ where: { reporterId: userId } }),
      prisma.report.count({ where: { targetUserId: userId } }),
    ]);

  return {
    user,
    listingCount,
    buyerOrderCount,
    sellerOrderCount,
    reportsMadeCount,
    reportsReceivedCount,
  };
}

export type UserStatusChange = "SUSPENDED" | "BANNED" | "ACTIVE";

// ADMIN-only — enforced by the caller (API route), not here, matching the
// rest of this codebase's convention of keeping authorization at the route
// boundary. Suspending/banning also revokes every active session as
// defense-in-depth: `session.ts` already blocks a non-ACTIVE user's next
// request on its own, but explicit revocation makes the cutoff immediate
// and auditable rather than relying only on the next lookup.
export async function setUserStatus(
  userId: string,
  status: UserStatusChange,
  actorId: string,
): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { status: true },
  });
  if (!existing) return false;

  const result = await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { status },
  });
  if (result.count === 0) return false;

  if (status !== "ACTIVE") {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const action =
    status === "SUSPENDED" ? "admin.user.suspend" : status === "BANNED" ? "admin.user.ban" : "admin.user.reactivate";
  await recordAudit({ actorId, action, targetType: "User", targetId: userId, metadata: { from: existing.status, to: status } });

  return true;
}

// ADMIN-only — enforced by the caller. Refuses to demote the last
// remaining ADMIN account, since that would permanently lock the platform
// out of its own admin console with no recovery path short of direct
// database access.
export async function setUserRole(
  userId: string,
  role: UserRole,
  actorId: string,
): Promise<{ success: true } | { success: false; error: "last_admin" | "not_found" }> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.deletedAt) return { success: false, error: "not_found" };

  if (target.role === "ADMIN" && role !== "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", deletedAt: null, id: { not: userId } },
    });
    if (otherAdmins === 0) return { success: false, error: "last_admin" };
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  await recordAudit({
    actorId,
    action: "admin.user.role_change",
    targetType: "User",
    targetId: userId,
    metadata: { from: target.role, to: role },
  });

  return { success: true };
}
