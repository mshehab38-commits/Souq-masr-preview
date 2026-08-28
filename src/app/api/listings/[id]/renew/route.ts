import { NextResponse } from "next/server";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { renewListing } from "@/modules/catalog/service";
import { recordAudit } from "@/lib/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await renewListing(id, user.id);
  if (!result.success) {
    return NextResponse.json(result, { status: 404 });
  }

  await recordAudit({ actorId: user.id, action: "listing.renew", targetType: "Listing", targetId: id });

  return NextResponse.json(result, { status: 200 });
}
