import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, requireAdmin, assertCsrf } from "@/modules/identity/service";
import { getUserDetail, setUserStatus, setUserRole } from "@/modules/identity/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const moderator = await requireModerator();
  if (!moderator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const detail = await getUserDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(detail);
});

// Status and role changes are ADMIN-only, not MODERATOR — a stricter check
// than the GET above, mirroring the split documented in
// docs/DECISIONS.md: moderators can see the user directory (useful context
// while working reports) but cannot themselves change account status/role.
const bodySchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
    role: z.enum(["INDIVIDUAL", "BUSINESS", "MODERATOR", "ADMIN"]).optional(),
  })
  .refine((data) => data.status !== undefined || data.role !== undefined, {
    message: "status or role is required",
  });

export const PATCH = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
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

  if (parsed.data.status) {
    const changed = await setUserStatus(id, parsed.data.status, admin.id);
    if (!changed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (parsed.data.role) {
    const result = await setUserRole(id, parsed.data.role, admin.id);
    if (!result.success) {
      return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 409 });
    }
  }

  return NextResponse.json({ success: true });
});
