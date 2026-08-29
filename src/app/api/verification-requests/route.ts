import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  getCurrentUser,
  submitVerificationRequest,
  getVerificationRequests,
} from "@/modules/identity/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  type: z.enum(["INDIVIDUAL_SELLER", "BUSINESS"]),
  businessName: z.string().trim().min(2).max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const GET = withApiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return NextResponse.json(await getVerificationRequests(user.id));
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
  if (parsed.data.type === "BUSINESS" && !parsed.data.businessName) {
    return NextResponse.json({ error: "business_name_required" }, { status: 400 });
  }

  const created = await submitVerificationRequest(user.id, parsed.data.type, {
    businessName: parsed.data.businessName,
    notes: parsed.data.notes,
  });

  await recordAudit({
    actorId: user.id,
    action: "verification_request.submit",
    targetType: "VerificationRequest",
    targetId: created.id,
    metadata: { type: parsed.data.type },
  });

  return NextResponse.json(created, { status: 201 });
});
