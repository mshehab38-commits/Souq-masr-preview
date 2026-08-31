import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { requestImageUploadTarget } from "@/modules/catalog/service";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const POST = withApiHandler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
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

  const result = await requestImageUploadTarget(id, user.id, parsed.data.contentType);
  if (!result.success) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : result.error === "rate_limited"
            ? 429
            : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
});
