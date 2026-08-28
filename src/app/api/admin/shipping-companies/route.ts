import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { listShippingCompanies, createShippingCompany } from "@/modules/shipping/service";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const companies = await listShippingCompanies(true);
  return NextResponse.json({ companies });
}

const bodySchema = z.object({
  slug: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(120),
  contactInfo: z.unknown().optional(),
});

export async function POST(request: Request) {
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

  const company = await createShippingCompany(parsed.data);

  await recordAudit({
    actorId: admin.id,
    action: "shipping_company.create",
    targetType: "ShippingCompany",
    targetId: company.id,
  });

  return NextResponse.json({ company }, { status: 201 });
}
