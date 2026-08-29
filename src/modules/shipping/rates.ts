import { prisma } from "@/lib/db";

// Every fee here is a real, negotiated courier price the owner enters —
// never invented by engineering (see prisma/schema.prisma's ShippingRate
// and ShippingCompany.defaultFlatFee comments).
export async function upsertShippingRate(shippingCompanyId: string, governorateId: string, flatFee: number) {
  return prisma.shippingRate.upsert({
    where: { shippingCompanyId_governorateId: { shippingCompanyId, governorateId } },
    update: { flatFee },
    create: { shippingCompanyId, governorateId, flatFee },
  });
}

export async function setDefaultFlatFee(shippingCompanyId: string, defaultFlatFee: number | null) {
  return prisma.shippingCompany.update({
    where: { id: shippingCompanyId },
    data: { defaultFlatFee },
  });
}

export async function listRatesForCompany(shippingCompanyId: string) {
  return prisma.shippingRate.findMany({
    where: { shippingCompanyId },
    include: { governorate: true },
  });
}

// Resolves the fee a specific company would charge for a governorate,
// falling back to that company's defaultFlatFee if no governorate-specific
// rate is configured. Returns null if neither exists — meaning this
// company simply isn't offered as a checkout option there.
export async function resolveShippingFee(
  shippingCompanyId: string,
  governorateId: string | null,
): Promise<number | null> {
  if (governorateId) {
    const specific = await prisma.shippingRate.findUnique({
      where: { shippingCompanyId_governorateId: { shippingCompanyId, governorateId } },
    });
    if (specific) return Number(specific.flatFee);
  }

  const company = await prisma.shippingCompany.findUnique({ where: { id: shippingCompanyId } });
  return company?.defaultFlatFee !== undefined && company?.defaultFlatFee !== null
    ? Number(company.defaultFlatFee)
    : null;
}

// Every active company with a resolvable fee for this governorate —
// what checkout actually offers the buyer as a PLATFORM_SHIPPING option.
export async function listAvailableShippingOptions(governorateId: string | null) {
  const companies = await prisma.shippingCompany.findMany({
    where: { isActive: true, deletedAt: null },
  });

  const options: { companyId: string; companyName: string; fee: number }[] = [];
  for (const company of companies) {
    const fee = await resolveShippingFee(company.id, governorateId);
    if (fee !== null) {
      options.push({ companyId: company.id, companyName: company.name, fee });
    }
  }
  return options;
}
