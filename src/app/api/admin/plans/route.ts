import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { listPlans, createPlan } from "@/modules/subscriptions/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const plans = await listPlans(true);
  return NextResponse.json({ plans });
});

const bodySchema = z.object({
  slug: z.string().trim().min(2).max(60),
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
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

  const plan = await createPlan(parsed.data);

  await recordAudit({
    actorId: admin.id,
    action: "subscription_plan.create",
    targetType: "SubscriptionPlan",
    targetId: plan.id,
  });

  return NextResponse.json({ plan }, { status: 201 });
});
