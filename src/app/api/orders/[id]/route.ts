import { NextResponse } from "next/server";
import { getCurrentUser, hasRole } from "@/modules/identity/service";
import { getOrderById } from "@/modules/orders/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isParty = order.buyerId === user.id || order.sellerId === user.id;
  if (!isParty && !hasRole(user.role, ["ADMIN"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ order });
});
