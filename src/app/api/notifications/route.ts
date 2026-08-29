import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listNotifications, getUnreadCount } from "@/modules/notifications/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const page = Number(url.searchParams.get("page")) || 1;

  const [result, unreadCount] = await Promise.all([
    listNotifications(user.id, { unreadOnly, page }),
    getUnreadCount(user.id),
  ]);

  return NextResponse.json({ ...result, unreadCount });
});
