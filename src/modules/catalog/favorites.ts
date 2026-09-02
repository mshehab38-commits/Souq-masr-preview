import { prisma } from "@/lib/db";

const FAVORITES_DEFAULT_LIMIT = 20;
const FAVORITES_MAX_LIMIT = 100;

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

// Powers the listing-detail page's favorite-button initial state — without
// this, the button always rendered as "not favorited" on page load
// regardless of the viewer's actual prior favorite, since nothing checked
// it before this function existed.
export async function isListingFavorited(userId: string, listingId: string): Promise<boolean> {
  const existing = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });
  return existing !== null;
}

export interface ListFavoriteListingsFilter {
  page?: number;
  limit?: number;
}

export async function listFavoriteListings(userId: string, filter: ListFavoriteListingsFilter = {}) {
  const limit = Math.min(Math.max(filter.limit || FAVORITES_DEFAULT_LIMIT, 1), FAVORITES_MAX_LIMIT);
  const page = Math.max(filter.page || 1, 1);
  const where = { userId };

  const [items, totalCount] = await Promise.all([
    prisma.favorite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { listing: { include: { images: { take: 1, orderBy: { sortOrder: "asc" } } } } },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.favorite.count({ where }),
  ]);

  return { items, page, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount };
}
