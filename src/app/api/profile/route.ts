import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser, formatEgyptianPhoneLocal } from "@/modules/identity/service";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    phone: formatEgyptianPhoneLocal(user.phone),
    name: user.name,
    role: user.role,
    phoneVerifiedAt: user.phoneVerifiedAt,
    commerceVerifiedAt: user.commerceVerifiedAt,
  });
});

const patchSchema = z.object({ name: z.string().trim().min(2).max(80) });

export const PATCH = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  await recordAudit({
    actorId: user.id,
    action: "profile.update",
    targetType: "User",
    targetId: user.id,
    metadata: { name: parsed.data.name },
  });

  return NextResponse.json({ ok: true });
});
