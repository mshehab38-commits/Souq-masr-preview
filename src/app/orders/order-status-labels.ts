export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "تم التأكيد",
  PREPARING: "قيد التجهيز",
  READY_FOR_PICKUP: "جاهز للاستلام من الشحن",
  PICKED_UP: "تم استلامه من الشحن",
  IN_TRANSIT: "في الطريق",
  OUT_FOR_DELIVERY: "خارج للتوصيل",
  DELIVERED: "تم التوصيل",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  FAILED: "فشل",
  RETURNED: "مرتجع",
  REFUNDED: "تم الاسترداد",
  DISPUTED: "متنازع عليه",
};

export function statusBadgeTone(status: string): "success" | "danger" | "warning" | "neutral" {
  if (["COMPLETED", "DELIVERED"].includes(status)) return "success";
  if (["CANCELLED", "FAILED", "DISPUTED"].includes(status)) return "danger";
  if (["RETURNED", "REFUNDED"].includes(status)) return "warning";
  return "neutral";
}
