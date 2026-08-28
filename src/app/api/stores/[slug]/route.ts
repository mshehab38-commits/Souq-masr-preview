import { NextResponse } from "next/server";
import { getStoreBySlug, listStorePublicListings } from "@/modules/store/service";

const DEFAULT_PAGE_SIZE = 20;

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const store = await getStoreBySlug(slug);
  if (!store) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const listings = await listStorePublicListings(store.ownerId, page, DEFAULT_PAGE_SIZE);

  return NextResponse.json({ store, listings });
}
