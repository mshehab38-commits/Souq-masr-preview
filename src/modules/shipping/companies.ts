import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface ShippingCompanyInput {
  slug: string;
  name: string;
  contactInfo?: unknown;
  isActive?: boolean;
  defaultFlatFee?: number | null;
}

export async function listShippingCompanies(includeInactive = false) {
  return prisma.shippingCompany.findMany({
    where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    include: { commissionRules: true },
    orderBy: { name: "asc" },
  });
}

export async function getShippingCompanyById(id: string) {
  return prisma.shippingCompany.findFirst({
    where: { id, deletedAt: null },
    include: { rates: true, commissionRules: true },
  });
}

export async function createShippingCompany(input: ShippingCompanyInput) {
  return prisma.shippingCompany.create({
    data: {
      slug: input.slug,
      name: input.name,
      contactInfo: input.contactInfo as Prisma.InputJsonValue | undefined,
      isActive: input.isActive ?? true,
    },
  });
}

export type UpdateShippingCompanyResult = { success: true } | { success: false; error: "not_found" };

export async function updateShippingCompany(
  id: string,
  input: Partial<ShippingCompanyInput>,
): Promise<UpdateShippingCompanyResult> {
  const result = await prisma.shippingCompany.updateMany({
    where: { id, deletedAt: null },
    data: {
      name: input.name,
      contactInfo: input.contactInfo as Prisma.InputJsonValue | undefined,
      isActive: input.isActive,
      defaultFlatFee: input.defaultFlatFee,
    },
  });
  if (result.count === 0) return { success: false, error: "not_found" };
  return { success: true };
}

export async function softDeleteShippingCompany(id: string): Promise<boolean> {
  const result = await prisma.shippingCompany.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  return result.count > 0;
}
