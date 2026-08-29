import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listOrdersForSeller } from "@/modules/orders/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const orders = await listOrdersForSeller(user.id);
  return NextResponse.json({ orders });
});
