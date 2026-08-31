import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { createListing } from "@/modules/catalog/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(5000).optional(),
  price: z.number().positive().max(999_999_999).optional(),
  negotiable: z.boolean().optional(),
  governorateId: z.string().min(1).optional(),
  cityId: z.string().min(1).optional(),
  attributes: z.unknown().optional(),
  commerceEnabled: z.boolean().optional(),
  fulfillmentMode: z.enum(["SELF_ARRANGED", "PLATFORM_SHIPPING", "SELLER_DELIVERY"]).optional(),
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

  const result = await createListing(user.id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: result.error === "rate_limited" ? 429 : 422 });
  }

  await recordAudit({
    actorId: user.id,
    action: "listing.create",
    targetType: "Listing",
    targetId: result.listingId,
  });

  return NextResponse.json(result, { status: 201 });
});
