import { prisma } from "@/lib/db";
import type { NotificationType } from "@prisma/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

// The single write path for every notification in the system — every
// caller passes the target userId explicitly, the same "never inferred"
// philosophy the ledger module uses for `account`.
export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });
}

export interface ListNotificationsFilter {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export async function listNotifications(userId: string, filter: ListNotificationsFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { userId, ...(filter.unreadOnly ? { readAt: null } : {}) };

  const [items, totalCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// Scoped by `userId` in the WHERE clause itself, not checked after
// fetching — a caller can never mark another user's notification as read
// by guessing its id, matching the ownership-scoping pattern used
// throughout the catalog module's bulk actions.
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
