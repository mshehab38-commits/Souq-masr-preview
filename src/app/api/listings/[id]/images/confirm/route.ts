import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { confirmImageUpload } from "@/modules/catalog/service";

const bodySchema = z.object({ key: z.string().min(1).max(512) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await confirmImageUpload(id, user.id, parsed.data.key);
  if (!result.success) {
    const status = result.error === "not_found" ? 404 : 403;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 201 });
}
