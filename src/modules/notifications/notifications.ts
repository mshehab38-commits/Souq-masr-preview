import { prisma } from "@/lib/db";
import type { NotificationType } from "@prisma/client";
import { getSmsProvider, getEmailProvider } from "@/modules/identity/service";
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
// Every notification also gets best-effort SMS (Phase 11) and email
// (Phase 14) mirrors — deliberately every NotificationType, not a
// curated subset: the alternative (an allowlist of "important enough"
// types) is an arbitrary judgment call with no real usage data behind it
// yet, whereas "notify everywhere" is a simple, easy-to-narrow-later
// default. Both channels cost nothing until the owner configures a real
// gateway/provider (see src/modules/identity/sms.ts,
// src/modules/identity/email.ts) — until then they only log. The two
// channels are dispatched concurrently and independently: neither
// depends on the other's outcome, and running them in series would
// double the inline latency added to every notification-creating request
// path (checkout, order transitions, moderation actions) for no benefit.
// A failure anywhere in this block (lookup or either send) is logged and
// swallowed, never allowed to make notification creation itself fail —
// the in-app row is the source of truth; SMS/email are delivery channels
// on top of it, not dependencies.
//
// The in-app row's own write is likewise never allowed to throw past this
// function. Every call site (checkout, an order-status transition, a
// moderation decision, a verification review) awaits this directly,
// without its own try/catch, after its real business operation has
// already committed — a transient DB blip on this write alone must never
// surface as a false failure response for an operation that actually
// succeeded. On failure this returns null instead of a Notification row;
// no caller inspects the return value, so this is a safe, non-breaking
// contract. See docs/DECISIONS.md.
export async function createNotification(input: CreateNotificationInput) {
  let notification;
  try {
    notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
  } catch (error) {
    logger.error("Failed to create notification row", {
      userId: input.userId,
      type: input.type,
      error: String(error),
    });
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { phone: true, email: true },
    });
    if (user) {
      const text = input.body ? `${input.title} — ${input.body}` : input.title;
      await Promise.allSettled([
        (async () => {
          try {
            await getSmsProvider().sendMessage(user.phone, text);
          } catch (error) {
            logger.error("Failed to send notification SMS", { userId: input.userId, error: String(error) });
          }
        })(),
        (async () => {
          if (!user.email) return;
          try {
            await getEmailProvider().sendNotification(user.email, input.title, text);
          } catch (error) {
            logger.error("Failed to send notification email", { userId: input.userId, error: String(error) });
          }
        })(),
      ]);
    }
  } catch (error) {
    logger.error("Failed to dispatch notification delivery channels", { userId: input.userId, error: String(error) });
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
