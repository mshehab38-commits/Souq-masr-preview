import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, assertCsrf } from "@/modules/identity/service";
import { getPlatformSettings, updatePlatformSettings } from "@/modules/settings/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const settings = await getPlatformSettings();
  return NextResponse.json({ settings });
});

const bodySchema = z.object({
  freeListingActiveLimit: z.number().int().min(0).nullable().optional(),
  paymentProcessingFeeBearer: z.enum(["PLATFORM", "SELLER", "BUYER"]).nullable().optional(),
  requirePrePublishReview: z.boolean().optional(),
});

export const PATCH = withApiHandler(async (request: Request) => {
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

  const settings = await updatePlatformSettings(admin.id, parsed.data);

  await recordAudit({
    actorId: admin.id,
    action: "settings.update",
    targetType: "PlatformSettings",
    metadata: parsed.data,
  });

  return NextResponse.json({ settings });
});
