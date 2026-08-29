import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, assertCsrf } from "@/modules/identity/service";
import { decidePendingListing } from "@/modules/moderation/service";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });

export const PATCH = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const moderator = await requireModerator();
  if (!moderator) {
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

  const result = await decidePendingListing(id, moderator.id, parsed.data.decision);
  if (!result.success) {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
