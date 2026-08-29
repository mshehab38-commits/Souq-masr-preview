import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/modules/notifications/notifications";

const createdUserIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
}

describe("createNotification / listNotifications", () => {
  afterEach(cleanup);

  it("creates a notification and lists it for the target user", async () => {
    const user = await makeUser();
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "لديك طلب جديد" });

    const result = await listNotifications(user.id);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("لديك طلب جديد");
    expect(result.items[0]!.readAt).toBeNull();
  });

  it("orders notifications newest first", async () => {
    const user = await makeUser();
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "أول" });
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "ثاني" });

    const result = await listNotifications(user.id);
    expect(result.items[0]!.title).toBe("ثاني");
    expect(result.items[1]!.title).toBe("أول");
  });

  it("filters to unread only", async () => {
    const user = await makeUser();
    const n1 = await createNotification({ userId: user.id, type: "NEW_ORDER", title: "مقروء" });
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "غير مقروء" });
    await markAsRead(n1.id, user.id);

    const result = await listNotifications(user.id, { unreadOnly: true });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("غير مقروء");
  });

  it("never returns another user's notifications", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await createNotification({ userId: other.id, type: "NEW_ORDER", title: "ليس لك" });

    const result = await listNotifications(user.id);
    expect(result.items).toHaveLength(0);
  });
});

describe("getUnreadCount", () => {
  afterEach(cleanup);

  it("counts only unread notifications for that user", async () => {
    const user = await makeUser();
    const n1 = await createNotification({ userId: user.id, type: "NEW_ORDER", title: "a" });
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "b" });
    await markAsRead(n1.id, user.id);

    expect(await getUnreadCount(user.id)).toBe(1);
  });
});

describe("markAsRead", () => {
  afterEach(cleanup);

  it("marks a notification read and is idempotent", async () => {
    const user = await makeUser();
    const notification = await createNotification({ userId: user.id, type: "NEW_ORDER", title: "a" });

    expect(await markAsRead(notification.id, user.id)).toBe(true);
    const updated = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.readAt).not.toBeNull();

    // Second call: already read, so the scoped update affects zero rows.
    expect(await markAsRead(notification.id, user.id)).toBe(false);
  });

  it("refuses to mark another user's notification as read", async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    const notification = await createNotification({ userId: owner.id, type: "NEW_ORDER", title: "a" });

    expect(await markAsRead(notification.id, attacker.id)).toBe(false);
    const unchanged = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(unchanged.readAt).toBeNull();
  });
});

describe("markAllAsRead", () => {
  afterEach(cleanup);

  it("marks every unread notification for that user and returns the count", async () => {
    const user = await makeUser();
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "a" });
    await createNotification({ userId: user.id, type: "NEW_ORDER", title: "b" });

    const count = await markAllAsRead(user.id);
    expect(count).toBe(2);
    expect(await getUnreadCount(user.id)).toBe(0);
  });

  it("does not touch another user's notifications", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await createNotification({ userId: other.id, type: "NEW_ORDER", title: "a" });

    await markAllAsRead(user.id);
    expect(await getUnreadCount(other.id)).toBe(1);
  });
});
