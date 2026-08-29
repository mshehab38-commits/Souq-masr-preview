import { NextResponse } from "next/server";
import { requireModerator } from "@/modules/identity/service";
import { listReports } from "@/modules/moderation/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const moderator = await requireModerator();
  if (!moderator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const targetType = url.searchParams.get("targetType");
  const page = Number(url.searchParams.get("page")) || 1;

  const result = await listReports({
    status: status === "OPEN" || status === "ACTION_TAKEN" || status === "DISMISSED" ? status : undefined,
    targetType: targetType === "LISTING" || targetType === "USER" ? targetType : undefined,
    page,
  });

  return NextResponse.json(result);
});
