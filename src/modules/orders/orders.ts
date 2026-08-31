import { prisma } from "@/lib/db";

const ORDER_INCLUDE = {
  listing: { include: { images: { where: { status: "READY" as const }, take: 1 } } },
  buyer: { select: { id: true, name: true, phone: true } },
  seller: { select: { id: true, name: true, phone: true } },
  shippingCompany: true,
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListOrdersFilter {
  page?: number;
  limit?: number;
}

export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
}

export async function listOrdersForBuyer(buyerId: string, filter: ListOrdersFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { buyerId };

  const [items, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}

export async function listOrdersForSeller(sellerId: string, filter: ListOrdersFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { sellerId };

  const [items, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}
