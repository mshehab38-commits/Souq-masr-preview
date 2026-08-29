import { NextResponse } from "next/server";
import { getCurrentUser, assertCsrf } from "@/modules/identity/service";
import { markAsRead } from "@/modules/notifications/service";
import { withApiHandler } from "@/lib/api-handler";

export const PATCH = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const changed = await markAsRead(id, user.id);
  if (!changed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
