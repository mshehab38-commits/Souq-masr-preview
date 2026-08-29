import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { updatePlan, softDeletePlan } from "@/modules/subscriptions/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  nameAr: z.string().trim().min(2).max(80).optional(),
  nameEn: z.string().trim().min(2).max(80).optional(),
  monthlyPrice: z.number().positive().nullable().optional(),
  yearlyPrice: z.number().positive().nullable().optional(),
  activeListingLimit: z.number().int().positive().nullable().optional(),
  imageLimitPerListing: z.number().int().positive().nullable().optional(),
  allowPromotedListings: z.boolean().optional(),
  priorityPlacement: z.boolean().optional(),
  geographicTargeting: z.unknown().optional(),
  storeFeatures: z.unknown().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
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

  const result = await updatePlan(id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: 404 });
  }

  await recordAudit({
    actorId: admin.id,
    action: "subscription_plan.update",
    targetType: "SubscriptionPlan",
    targetId: id,
    metadata: parsed.data,
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const deleted = await softDeletePlan(id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit({
    actorId: admin.id,
    action: "subscription_plan.delete",
    targetType: "SubscriptionPlan",
    targetId: id,
  });

  return NextResponse.json({ success: true });
});
