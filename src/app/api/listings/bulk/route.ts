import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { bulkUpdateListings } from "@/modules/catalog/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const MAX_BULK_IDS = 100;

const bodySchema = z.object({
  listingIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_IDS),
  action: z.enum(["mark_sold", "delete", "relist"]),
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

  const result = await bulkUpdateListings(user.id, parsed.data.listingIds, parsed.data.action);

  await recordAudit({
    actorId: user.id,
    action: `listing.bulk.${parsed.data.action}`,
    targetType: "Listing",
    metadata: { listingIds: parsed.data.listingIds, affected: result.affected },
  });

  return NextResponse.json(result, { status: 200 });
});
