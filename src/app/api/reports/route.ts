import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, assertCsrf } from "@/modules/identity/service";
import { createReport } from "@/modules/moderation/service";

const REPORT_REASONS = [
  "SPAM",
  "PROHIBITED_ITEM",
  "FRAUD_SCAM",
  "MISLEADING",
  "OFFENSIVE_CONTENT",
  "DUPLICATE",
  "OTHER",
] as const;

const bodySchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("LISTING"),
    listingId: z.string().min(1),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(2000).optional(),
  }),
  z.object({
    targetType: z.literal("USER"),
    targetUserId: z.string().min(1),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(2000).optional(),
  }),
]);

export async function POST(request: Request) {
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

  const result = await createReport(user.id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: result.error === "target_not_found" ? 404 : 400 });
  }

  return NextResponse.json({ report: result.report, alreadyOpen: result.alreadyOpen }, { status: 201 });
}
