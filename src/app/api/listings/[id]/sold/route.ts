import { NextResponse } from "next/server";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { markListingAsSold } from "@/modules/catalog/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const POST = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const updated = await markListingAsSold(id, user.id);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit({ actorId: user.id, action: "listing.mark_sold", targetType: "Listing", targetId: id });
  return NextResponse.json({ ok: true });
});
