import { prisma } from "@/lib/db";

const ORDER_INCLUDE = {
  listing: { include: { images: { where: { status: "READY" as const }, take: 1 } } },
  buyer: { select: { id: true, name: true, phone: true } },
  seller: { select: { id: true, name: true, phone: true } },
  shippingCompany: true,
} as const;

export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
}

export async function listOrdersForBuyer(buyerId: string) {
  return prisma.order.findMany({
    where: { buyerId },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function listOrdersForSeller(sellerId: string) {
  return prisma.order.findMany({
    where: { sellerId },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}
