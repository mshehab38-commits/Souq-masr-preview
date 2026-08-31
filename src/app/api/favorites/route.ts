import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listFavoriteListings } from "@/modules/catalog/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page")) || undefined;
  const limit = Number(searchParams.get("limit")) || undefined;

  return NextResponse.json(await listFavoriteListings(user.id, { page, limit }));
});
