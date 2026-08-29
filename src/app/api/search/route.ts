import { NextResponse } from "next/server";
import { z } from "zod";
import { getSearchProvider, resolveSearchFilters } from "@/modules/search/service";
import { withApiHandler } from "@/lib/api-handler";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().max(60).optional(),
  governorate: z.string().max(60).optional(),
  city: z.string().max(60).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "relevance"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const filters = await resolveSearchFilters(parsed.data);
  const result = await getSearchProvider().search(filters, { page: parsed.data.page ?? 1, limit: 20 });

  return NextResponse.json(result);
});
