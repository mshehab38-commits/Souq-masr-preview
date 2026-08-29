import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf, normalizeEgyptianPhone } from "@/modules/identity/service";
import { grantSubscription } from "@/modules/subscriptions/service";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  userPhone: z.string().min(1),
  planId: z.string().min(1),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
});

// Grants a subscription directly — the interim mechanism until a live
// payment gateway exists for self-serve purchase (see the Subscription
// model's comment in prisma/schema.prisma). Intended for use after an
// offline/manual payment arrangement with the seller.
export const POST = withApiHandler(async (request: Request) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const phone = normalizeEgyptianPhone(parsed.data.userPhone);
  if (!phone) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const result = await grantSubscription(admin.id, {
    userId: user.id,
    planId: parsed.data.planId,
    billingCycle: parsed.data.billingCycle,
  });
  if (!result.success) {
    return NextResponse.json(result, { status: 422 });
  }

  await recordAudit({
    actorId: admin.id,
    action: "subscription.grant",
    targetType: "Subscription",
    targetId: result.subscriptionId,
    metadata: { userId: user.id, planId: parsed.data.planId, billingCycle: parsed.data.billingCycle },
  });

  return NextResponse.json(result, { status: 201 });
});
