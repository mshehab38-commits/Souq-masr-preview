import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { listRatesForCompany, upsertShippingRate } from "@/modules/shipping/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const rates = await listRatesForCompany(id);
  return NextResponse.json({ rates });
});

const bodySchema = z.object({
  governorateId: z.string().min(1),
  flatFee: z.number().positive(),
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

  const rate = await upsertShippingRate(id, admin.id, parsed.data.governorateId, parsed.data.flatFee);

  return NextResponse.json({ rate }, { status: 200 });
});
