import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { listOrdersForBuyer } from "@/modules/orders/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const orders = await listOrdersForBuyer(user.id);
  return NextResponse.json({ orders });
}
