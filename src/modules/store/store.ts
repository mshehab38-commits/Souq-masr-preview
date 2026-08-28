import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateStoreSlug } from "./slug";

const MAX_SLUG_RETRIES = 5;

export interface StoreInput {
  name: string;
  description?: string;
}

export type CreateStoreResult =
  | { success: true; storeId: string; slug: string }
  | { success: false; error: "already_exists" };

export async function createStore(ownerId: string, input: StoreInput): Promise<CreateStoreResult> {
  const existing = await prisma.store.findFirst({ where: { ownerId, deletedAt: null } });
  if (existing) return { success: false, error: "already_exists" };

  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const slug = generateStoreSlug(input.name);
    try {
      const store = await prisma.store.create({
        data: { ownerId, slug, name: input.name, description: input.description },
      });
      return { success: true, storeId: store.id, slug: store.slug };
    } catch (error) {
      // P2002 = unique constraint violation. A slug collision is
      // astronomically unlikely (8 hex chars of randomness) but retried
      // rather than assumed impossible; an ownerId collision means a store
      // was created concurrently between our existence check and this
      // insert, which we surface the same way as the upfront check.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes("ownerId")) return { success: false, error: "already_exists" };
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to generate a unique store slug after multiple attempts");
}

export type UpdateStoreResult =
  | { success: true }
  | { success: false; error: "not_found" };

export async function updateStore(
  ownerId: string,
  input: Partial<StoreInput> & { logoUrl?: string | null; coverUrl?: string | null },
): Promise<UpdateStoreResult> {
  const result = await prisma.store.updateMany({
    where: { ownerId, deletedAt: null },
    data: {
      name: input.name,
      description: input.description,
      logoUrl: input.logoUrl,
      coverUrl: input.coverUrl,
    },
  });
  if (result.count === 0) return { success: false, error: "not_found" };
  return { success: true };
}

export async function getStoreByOwnerId(ownerId: string) {
  return prisma.store.findFirst({ where: { ownerId, deletedAt: null } });
}

export async function getStoreBySlug(slug: string) {
  return prisma.store.findFirst({
    where: { slug, deletedAt: null },
    include: { owner: { select: { id: true, name: true, commerceVerifiedAt: true } } },
  });
}

export async function listStorePublicListings(ownerId: string, page: number, pageSize: number) {
  const where = { ownerId, status: "ACTIVE" as const, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { images: { where: { status: "READY" }, orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
    prisma.listing.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
