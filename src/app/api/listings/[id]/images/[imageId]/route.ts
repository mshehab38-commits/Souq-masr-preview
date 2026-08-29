import { NextResponse } from "next/server";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { deleteListingImage } from "@/modules/catalog/service";
import { withApiHandler } from "@/lib/api-handler";

export const DELETE = withApiHandler(async (request: Request, context: { params: Promise<{ id: string; imageId: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { imageId } = await context.params;
  const deleted = await deleteListingImage(imageId, user.id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
