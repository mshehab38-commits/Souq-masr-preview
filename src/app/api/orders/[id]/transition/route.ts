import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser, hasRole } from "@/modules/identity/service";
import { transitionOrder } from "@/modules/orders/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  targetStatus: z.enum([
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
    "FAILED",
    "RETURNED",
    "REFUNDED",
    "DISPUTED",
  ]),
  cancelReason: z.string().trim().max(500).optional(),
});

export const POST = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const isAdmin = hasRole(user.role, ["ADMIN"]);
  const result = await transitionOrder(id, user.id, isAdmin, parsed.data);
  if (!result.success) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 422;
    return NextResponse.json(result, { status });
  }

  await recordAudit({
    actorId: user.id,
    action: `order.transition.${parsed.data.targetStatus.toLowerCase()}`,
    targetType: "Order",
    targetId: id,
  });

  return NextResponse.json({ success: true });
});
