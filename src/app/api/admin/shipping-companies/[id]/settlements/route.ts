import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { listSettlements, computeSettlementForPeriod } from "@/modules/shipping/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const settlements = await listSettlements(id);
  return NextResponse.json({ settlements });
});

const bodySchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export const POST = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
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

  const settlement = await computeSettlementForPeriod(
    id,
    new Date(parsed.data.periodStart),
    new Date(parsed.data.periodEnd),
  );

  await recordAudit({
    actorId: admin.id,
    action: "shipping_settlement.compute",
    targetType: "ShippingSettlement",
    targetId: settlement.id,
  });

  return NextResponse.json({ settlement }, { status: 201 });
});
