import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listListingsByOwner } from "@/modules/catalog/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  return NextResponse.json(await listListingsByOwner(user.id));
}
