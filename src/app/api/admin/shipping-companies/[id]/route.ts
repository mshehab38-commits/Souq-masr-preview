import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { getShippingCompanyById, updateShippingCompany, softDeleteShippingCompany } from "@/modules/shipping/service";
import { recordAudit } from "@/lib/audit";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const company = await getShippingCompanyById(id);
  if (!company) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ company });
}

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  contactInfo: z.unknown().optional(),
  isActive: z.boolean().optional(),
  defaultFlatFee: z.number().positive().nullable().optional(),
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

  const result = await updateShippingCompany(id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: 404 });
  }

  await recordAudit({
    actorId: admin.id,
    action: "shipping_company.update",
    targetType: "ShippingCompany",
    targetId: id,
    metadata: parsed.data,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const deleted = await softDeleteShippingCompany(id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit({
    actorId: admin.id,
    action: "shipping_company.delete",
    targetType: "ShippingCompany",
    targetId: id,
  });

  return NextResponse.json({ success: true });
}
