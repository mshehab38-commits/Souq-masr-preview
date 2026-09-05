import { NextResponse } from "next/server";
import { assertCsrf, getCurrentUser, cancelAccountDeletionRequest } from "@/modules/identity/service";
import { withApiHandler } from "@/lib/api-handler";

export const DELETE = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const cancelled = await cancelAccountDeletionRequest(id, user.id);
  if (!cancelled) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
