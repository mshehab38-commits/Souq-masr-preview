import { prisma } from "@/lib/db";
import type { NotificationType } from "@prisma/client";
import { getSmsProvider } from "@/modules/identity/service";
import { logger } from "@/lib/logger";

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
//
// Every notification also gets a best-effort SMS mirror (Phase 11) —
// deliberately every NotificationType, not a curated subset: the
// alternative (an allowlist of "important enough" types) is an arbitrary
// judgment call with no real usage data behind it yet, whereas "notify
// everywhere" is a simple, easy-to-narrow-later default. It costs nothing
// until the owner configures a real SMS gateway (see
// src/modules/identity/sms.ts) — until then this only logs. A failure
// here (lookup or send) is logged and swallowed, never allowed to make
// notification creation itself fail — the in-app row is the source of
// truth; SMS is a delivery channel on top of it, not a dependency.
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });

  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { phone: true } });
    if (user) {
      const text = input.body ? `${input.title} — ${input.body}` : input.title;
      await getSmsProvider().sendMessage(user.phone, text);
    }
  } catch (error) {
    logger.error("Failed to send notification SMS", { userId: input.userId, error: String(error) });
  }

  return notification;
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
