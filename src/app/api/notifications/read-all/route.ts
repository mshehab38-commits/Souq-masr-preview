import { NextResponse } from "next/server";
import { getCurrentUser, assertCsrf } from "@/modules/identity/service";
import { markAllAsRead } from "@/modules/notifications/service";
import { withApiHandler } from "@/lib/api-handler";

export const POST = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const count = await markAllAsRead(user.id);
  return NextResponse.json({ success: true, count });
});
