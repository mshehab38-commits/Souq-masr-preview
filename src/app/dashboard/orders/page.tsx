import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { listOrdersForSeller } from "@/modules/orders/service";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/States";
import { ORDER_STATUS_LABELS, statusBadgeTone } from "@/app/orders/order-status-labels";

export default async function MySalesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const orders = await listOrdersForSeller(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 font-cairo text-2xl font-bold text-neutral-900">مبيعاتي</h1>

      {orders.length === 0 ? (
        <EmptyState title="لا توجد مبيعات بعد" description="فعّل الشراء المباشر على إعلاناتك لتظهر هنا" />
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-900">{order.listing.title}</p>
                  <p className="text-sm text-neutral-500">المشتري: {order.buyer.name ?? order.buyer.phone}</p>
                  <PriceTag amount={Number(order.totalAmount)} size="sm" />
                </div>
                <Badge tone={statusBadgeTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
