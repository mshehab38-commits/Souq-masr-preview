import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  getCurrentUser,
  submitAccountDeletionRequest,
  getAccountDeletionRequests,
} from "@/modules/identity/service";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const GET = withApiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({ items: await getAccountDeletionRequests(user.id) });
});

export const POST = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const created = await submitAccountDeletionRequest(user.id, parsed.data.reason);

  await recordAudit({
    actorId: user.id,
    action: "account_deletion_request.submit",
    targetType: "AccountDeletionRequest",
    targetId: created.request.id,
    metadata: { alreadyPending: created.alreadyPending },
  });

  return NextResponse.json({ request: created.request, alreadyPending: created.alreadyPending }, { status: 201 });
});
