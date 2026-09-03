import { NextResponse } from "next/server";
import { requireAdmin } from "@/modules/identity/service";
import { listAuditLogs } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? undefined;
  const targetType = url.searchParams.get("targetType") ?? undefined;
  const page = Number(url.searchParams.get("page")) || 1;

  const result = await listAuditLogs({ action, targetType, page });

  return NextResponse.json(result);
});
