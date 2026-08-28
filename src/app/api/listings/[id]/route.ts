import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import {
  getListingById,
  updateListing,
  softDeleteListing,
  incrementListingViewCount,
} from "@/modules/catalog/service";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const listing = await getListingById(id);
  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await incrementListingViewCount(id);
  return NextResponse.json(listing);
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(5000).optional(),
  price: z.number().positive().max(999_999_999).optional(),
  negotiable: z.boolean().optional(),
  governorateId: z.string().min(1).optional(),
  cityId: z.string().min(1).optional(),
  attributes: z.unknown().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await updateListing(id, user.id, parsed.data);
  if (!result.success) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 422;
    return NextResponse.json(result, { status });
  }

  await recordAudit({ actorId: user.id, action: "listing.update", targetType: "Listing", targetId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const deleted = await softDeleteListing(id, user.id);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit({ actorId: user.id, action: "listing.delete", targetType: "Listing", targetId: id });
  return NextResponse.json({ ok: true });
}
