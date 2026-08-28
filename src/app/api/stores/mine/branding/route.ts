import { NextResponse } from "next/server";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { uploadStoreBranding, type BrandingKind } from "@/modules/store/service";
import { recordAudit } from "@/lib/audit";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const kindParam = new URL(request.url).searchParams.get("kind");
  if (kindParam !== "logo" && kindParam !== "cover") {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const kind: BrandingKind = kindParam;

  const contentType = request.headers.get("content-type") ?? "";
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "invalid_content_type" }, { status: 400 });
  }

  const arrayBuffer = await request.arrayBuffer();
  const result = await uploadStoreBranding(user.id, kind, Buffer.from(arrayBuffer));
  if (!result.success) {
    const status = result.error === "not_found" ? 404 : 422;
    return NextResponse.json(result, { status });
  }

  await recordAudit({ actorId: user.id, action: `store.branding.${kind}`, targetType: "Store" });

  return NextResponse.json(result, { status: 200 });
}
