import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, assertCsrf } from "@/modules/identity/service";
import { reviewVerificationRequest } from "@/modules/identity/service";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().trim().max(2000).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const result = await reviewVerificationRequest(id, moderator.id, parsed.data.decision, parsed.data.notes);
  if (!result.success) {
    return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 409 });
  }

  return NextResponse.json({ success: true });
}
