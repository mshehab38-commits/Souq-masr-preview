import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listFavoriteListings } from "@/modules/catalog/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json(await listFavoriteListings(user.id));
});
