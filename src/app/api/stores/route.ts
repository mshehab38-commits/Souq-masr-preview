import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { createStore } from "@/modules/store/service";
import { recordAudit } from "@/lib/audit";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
});

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

  const result = await createStore(user.id, parsed.data);
  if (!result.success) {
    return NextResponse.json(result, { status: 422 });
  }

  await recordAudit({
    actorId: user.id,
    action: "store.create",
    targetType: "Store",
    targetId: result.storeId,
  });

  return NextResponse.json(result, { status: 201 });
}
