import { NextResponse } from "next/server";
import { requireModerator } from "@/modules/identity/service";
import { listPendingReviewListings } from "@/modules/catalog/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const moderator = await requireModerator();
  if (!moderator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page")) || 1;

  const result = await listPendingReviewListings({ page });
  return NextResponse.json(result);
});
