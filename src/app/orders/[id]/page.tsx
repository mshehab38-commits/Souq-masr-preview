import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser, hasRole } from "@/modules/identity/service";
import { getOrderById, resolveActor, allowedNextStatuses } from "@/modules/orders/service";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriceTag } from "@/components/ui/PriceTag";
import { ORDER_STATUS_LABELS, statusBadgeTone } from "../order-status-labels";
import { OrderActions } from "./OrderActions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/orders/${id}`);
  }

  const order = await getOrderById(id);
  if (!order) {
    notFound();
  }

  const isAdmin = hasRole(user.role, ["ADMIN"]);
  const actor = resolveActor(order, user.id, isAdmin);
  if (!actor) {
    notFound();
  }

  const nextStatuses = allowedNextStatuses(order.status, actor);
  const thumbnail = order.listing.images[0]?.thumbnailUrl;
  const address = order.shippingAddress as
    | { recipientName?: string; phone?: string; addressLine?: string }
    | null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-cairo text-2xl font-bold text-neutral-900">تفاصيل الطلب</h1>
        <Badge tone={statusBadgeTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>

      <Card className="mb-4 flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
          {thumbnail && <Image src={thumbnail} alt={order.listing.title} fill className="object-cover" />}
        </div>
        <div>
          <p className="font-medium text-neutral-900">{order.listing.title}</p>
          <PriceTag amount={Number(order.productPrice)} size="sm" />
        </div>
      </Card>

      <Card className="mb-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">سعر المنتج</span>
          <span>{Number(order.productPrice).toLocaleString("ar-EG")} ج.م</span>
        </div>
        {order.shippingFee !== null && (
          <div className="flex justify-between">
            <span className="text-neutral-500">رسوم الشحن ({order.shippingCompany?.name})</span>
            <span>{Number(order.shippingFee).toLocaleString("ar-EG")} ج.م</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-100 pt-2 font-medium">
          <span>الإجمالي</span>
          <span>{Number(order.totalAmount).toLocaleString("ar-EG")} ج.م</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>طريقة الدفع</span>
          <span>{order.paymentMethod === "CASH_ON_DELIVERY" ? "الدفع عند الاستلام" : "دفع إلكتروني"}</span>
        </div>
      </Card>

      {address && (
        <Card className="mb-4 text-sm">
          <p className="mb-1 font-medium text-neutral-900">عنوان التوصيل</p>
          <p className="text-neutral-600">{address.recipientName}</p>
          <p className="text-neutral-600">{address.phone}</p>
          {address.addressLine && <p className="text-neutral-600">{address.addressLine}</p>}
        </Card>
      )}

      <Card className="mb-4 flex items-center justify-between text-sm">
        <span className="text-neutral-500">{actor === "BUYER" ? "البائع" : "المشتري"}</span>
        <span className="font-medium text-neutral-900">
          {actor === "BUYER" ? order.seller.name ?? order.seller.phone : order.buyer.name ?? order.buyer.phone}
        </span>
      </Card>

      {nextStatuses.length > 0 && <OrderActions orderId={order.id} nextStatuses={nextStatuses} />}
    </main>
  );
}
