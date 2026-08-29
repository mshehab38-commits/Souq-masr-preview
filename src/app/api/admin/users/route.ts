import { NextResponse } from "next/server";
import { requireModerator } from "@/modules/identity/service";
import { listUsers } from "@/modules/identity/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const moderator = await requireModerator();
  if (!moderator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? undefined;
  const status = url.searchParams.get("status");
  const role = url.searchParams.get("role");
  const page = Number(url.searchParams.get("page")) || 1;

  const result = await listUsers({
    query,
    status: status === "ACTIVE" || status === "SUSPENDED" || status === "BANNED" ? status : undefined,
    role:
      role === "INDIVIDUAL" || role === "BUSINESS" || role === "MODERATOR" || role === "ADMIN"
        ? role
        : undefined,
    page,
  });

  return NextResponse.json(result);
});
