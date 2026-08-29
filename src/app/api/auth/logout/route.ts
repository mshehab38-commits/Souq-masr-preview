import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  assertCsrf,
  destroySession,
  getCurrentUser,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from "@/modules/identity/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const POST = withApiHandler(async (request: Request) => {
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await destroySession(token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(CSRF_COOKIE_NAME);

  if (user) {
    await recordAudit({ actorId: user.id, action: "auth.logout" });
  }

  return NextResponse.json({ ok: true });
});
