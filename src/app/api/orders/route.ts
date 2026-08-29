import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { createOrder } from "@/modules/orders/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  listingId: z.string().min(1),
  paymentMethod: z.enum(["CASH_ON_DELIVERY", "ONLINE"]).optional(),
  shippingCompanyId: z.string().min(1).optional(),
  shippingAddress: z
    .object({
      recipientName: z.string().trim().min(2).max(80),
      phone: z.string().trim().min(6).max(20),
      governorateId: z.string().min(1).optional(),
      cityId: z.string().min(1).optional(),
      addressLine: z.string().trim().max(300).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .optional(),
  buyerNote: z.string().trim().max(500).optional(),
});

export const POST = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await createOrder(user.id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: 422 });
  }

  await recordAudit({
    actorId: user.id,
    action: "order.create",
    targetType: "Order",
    targetId: result.orderId,
  });

  return NextResponse.json(result, { status: 201 });
});
