import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listOrdersForSeller } from "@/modules/orders/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page")) || undefined;
  const limit = Number(searchParams.get("limit")) || undefined;

  const result = await listOrdersForSeller(user.id, { page, limit });
  return NextResponse.json(result);
});
