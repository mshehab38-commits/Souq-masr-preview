import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { getCommissionRule, setCommissionRule } from "@/modules/shipping/service";
import { recordAudit } from "@/lib/audit";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const rule = await getCommissionRule(id);
  return NextResponse.json({ rule });
}

const bodySchema = z.object({
  commissionPercent: z.number().min(0).max(100).nullable(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const rule = await setCommissionRule(id, parsed.data.commissionPercent);

  await recordAudit({
    actorId: admin.id,
    action: "shipping_commission_rule.update",
    targetType: "ShippingCommissionRule",
    targetId: rule.id,
    metadata: parsed.data,
  });

  return NextResponse.json({ rule });
}
