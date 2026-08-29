import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, requireAdmin, assertCsrf } from "@/modules/identity/service";
import { resolveReport } from "@/modules/moderation/service";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("DISMISS"), notes: z.string().trim().max(2000).optional() }),
  z.object({
    decision: z.literal("ACTION_TAKEN"),
    action: z.enum(["REMOVE_LISTING", "SUSPEND_USER", "FLAG_FOR_REVIEW"]).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
]);

// SUSPEND_USER requires full ADMIN authority (same as PATCH
// /api/admin/users/[id]); a MODERATOR may dismiss a report or remove a
// listing, matching the requireModerator()/requireAdmin() split documented
// in docs/DECISIONS.md.
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

  if (parsed.data.decision === "ACTION_TAKEN" && parsed.data.action === "SUSPEND_USER") {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "forbidden_requires_admin" }, { status: 403 });
    }
  }

  const result = await resolveReport(id, moderator.id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 409 });
  }

  return NextResponse.json({ success: true });
});
