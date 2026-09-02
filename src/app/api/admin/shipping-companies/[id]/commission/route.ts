import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { getCommissionRule, setCommissionRule } from "@/modules/shipping/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const rule = await getCommissionRule(id);
  return NextResponse.json({ rule });
});

const bodySchema = z.object({
  commissionPercent: z.number().min(0).max(100).nullable(),
});

export const PATCH = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
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

  const rule = await setCommissionRule(id, admin.id, parsed.data.commissionPercent);

  return NextResponse.json({ rule });
});
