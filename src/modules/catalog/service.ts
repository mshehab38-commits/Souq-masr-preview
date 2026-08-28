import { prisma } from "@/lib/db";

export async function getCategories() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { attributes: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function getGovernorates() {
  return prisma.governorate.findMany({
    orderBy: { nameAr: "asc" },
    include: { cities: { orderBy: { nameAr: "asc" } } },
  });
}
