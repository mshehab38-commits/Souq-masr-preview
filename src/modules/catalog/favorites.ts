import { prisma } from "@/lib/db";

export async function toggleFavorite(userId: string, listingId: string): Promise<{ favorited: boolean }> {
  const existing = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId, listingId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return { favorited: false };
  }

  await prisma.favorite.create({ data: { userId, listingId } });
  return { favorited: true };
}

export async function listFavoriteListings(userId: string) {
  return prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { listing: { include: { images: { take: 1, orderBy: { sortOrder: "asc" } } } } },
  });
}
