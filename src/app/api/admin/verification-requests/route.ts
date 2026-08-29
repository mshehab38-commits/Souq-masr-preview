import { NextResponse } from "next/server";
import { requireModerator } from "@/modules/identity/service";
import { listVerificationRequests } from "@/modules/identity/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const moderator = await requireModerator();
  if (!moderator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const page = Number(url.searchParams.get("page")) || 1;

  const result = await listVerificationRequests({
    status: status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? status : undefined,
    page,
  });

  return NextResponse.json(result);
});
