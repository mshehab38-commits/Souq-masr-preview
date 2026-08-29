import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { createSavedSearch, listSavedSearches } from "@/modules/search/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({ items: await listSavedSearches(user.id) });
});

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  query: z.object({
    q: z.string().trim().max(200).optional(),
    category: z.string().max(60).optional(),
    governorate: z.string().max(60).optional(),
    city: z.string().max(60).optional(),
    minPrice: z.coerce.number().positive().optional(),
    maxPrice: z.coerce.number().positive().optional(),
    sort: z.enum(["newest", "price_asc", "price_desc", "relevance"]).optional(),
  }),
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

  const result = await createSavedSearch(user.id, parsed.data.name, parsed.data.query);
  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result, { status: 201 });
});
