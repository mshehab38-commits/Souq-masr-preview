import type { OrderStatus } from "@prisma/client";

export type OrderActor = "BUYER" | "SELLER" | "ADMIN" | "SYSTEM";

interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  allowedActors: OrderActor[];
}

// Encodes the order lifecycle from the original spec: Pending → Confirmed
// → Preparing → Ready for Pickup → Picked Up → In Transit → Out for
// Delivery → Delivered → Completed, plus Cancelled/Failed/Returned/
// Refunded/Disputed. Who can trigger each step reflects that no real
// courier API is integrated yet — PICKED_UP/IN_TRANSIT/OUT_FOR_DELIVERY
// are admin/system-driven placeholders for where a live Shipping Provider
// abstraction will report status automatically once one exists.
const TRANSITIONS: Transition[] = [
  { from: "PENDING", to: "CONFIRMED", allowedActors: ["SELLER"] },
  { from: "PENDING", to: "CANCELLED", allowedActors: ["BUYER", "SELLER"] },
  { from: "PENDING", to: "FAILED", allowedActors: ["SYSTEM"] },

  { from: "CONFIRMED", to: "PREPARING", allowedActors: ["SELLER"] },
  { from: "CONFIRMED", to: "CANCELLED", allowedActors: ["BUYER", "SELLER"] },

  { from: "PREPARING", to: "READY_FOR_PICKUP", allowedActors: ["SELLER"] },
  { from: "PREPARING", to: "OUT_FOR_DELIVERY", allowedActors: ["SELLER"] },
  { from: "PREPARING", to: "DELIVERED", allowedActors: ["SELLER"] },
  { from: "PREPARING", to: "CANCELLED", allowedActors: ["SELLER", "BUYER"] },

  { from: "READY_FOR_PICKUP", to: "PICKED_UP", allowedActors: ["SELLER", "ADMIN", "SYSTEM"] },
  { from: "READY_FOR_PICKUP", to: "CANCELLED", allowedActors: ["SELLER"] },

  { from: "PICKED_UP", to: "IN_TRANSIT", allowedActors: ["ADMIN", "SYSTEM"] },
  { from: "IN_TRANSIT", to: "OUT_FOR_DELIVERY", allowedActors: ["ADMIN", "SYSTEM"] },
  { from: "OUT_FOR_DELIVERY", to: "DELIVERED", allowedActors: ["ADMIN", "SYSTEM", "BUYER"] },

  { from: "DELIVERED", to: "COMPLETED", allowedActors: ["BUYER", "SYSTEM"] },
  { from: "DELIVERED", to: "RETURNED", allowedActors: ["BUYER", "ADMIN"] },
  { from: "DELIVERED", to: "DISPUTED", allowedActors: ["BUYER", "ADMIN"] },

  { from: "RETURNED", to: "REFUNDED", allowedActors: ["ADMIN"] },
  { from: "DISPUTED", to: "REFUNDED", allowedActors: ["ADMIN"] },
  { from: "DISPUTED", to: "COMPLETED", allowedActors: ["ADMIN"] },
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return TRANSITIONS.some(
    (t) => t.from === from && t.to === to && (t.allowedActors.includes(actor) || actor === "ADMIN"),
  );
}

export function allowedNextStatuses(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return TRANSITIONS.filter(
    (t) => t.from === from && (t.allowedActors.includes(actor) || actor === "ADMIN"),
  ).map((t) => t.to);
}

const TERMINAL_STATUSES: OrderStatus[] = ["CANCELLED", "FAILED", "COMPLETED", "REFUNDED"];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// Canonical Arabic labels for OrderStatus — the single source of truth so
// the order-status-change notification and the order UI never drift apart.
// UI-only presentation (badge color) stays in src/app/orders/, which
// re-exports this.
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
