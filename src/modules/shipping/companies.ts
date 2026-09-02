import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/lib/audit";

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

// Self-audits with the prior values for every key present in `input` —
// see settings.ts's updatePlatformSettings for the same pattern and
// docs/DECISIONS.md for why.
export async function updateShippingCompany(
  id: string,
  actorId: string,
  input: Partial<ShippingCompanyInput>,
): Promise<UpdateShippingCompanyResult> {
  const before = await prisma.shippingCompany.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { success: false, error: "not_found" };

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

  // defaultFlatFee is a Prisma Decimal — convert to a plain number before
  // storing in JSON metadata (see plans.ts's updatePlan for the same fix
  // and why a raw Decimal would silently serialize as a string instead).
  const from = Object.fromEntries(
    Object.keys(input).map((key) => {
      const value = before[key as keyof typeof before];
      return [key, value instanceof Prisma.Decimal ? value.toNumber() : value];
    }),
  );
  await recordAudit({
    actorId,
    action: "shipping_company.update",
    targetType: "ShippingCompany",
    targetId: id,
    metadata: { from, to: input },
  });

  return { success: true };
}

export async function softDeleteShippingCompany(id: string): Promise<boolean> {
  const result = await prisma.shippingCompany.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  return result.count > 0;
}
