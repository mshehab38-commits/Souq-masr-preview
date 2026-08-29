import { NextResponse } from "next/server";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { revokeSubscription } from "@/modules/subscriptions/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const DELETE = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const revoked = await revokeSubscription(id);
  if (!revoked) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit({
    actorId: admin.id,
    action: "subscription.revoke",
    targetType: "Subscription",
    targetId: id,
  });

  return NextResponse.json({ success: true });
});
