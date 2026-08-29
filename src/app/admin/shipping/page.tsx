import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/identity/service";
import { listShippingCompanies } from "@/modules/shipping/service";
import { getGovernorates } from "@/modules/catalog/service";
import { ShippingManager } from "./ShippingManager";

// Financial config stays ADMIN-only even though the shared /admin layout
// now admits MODERATOR too — see docs/DECISIONS.md.
export default async function AdminShippingPage() {
  if (!(await requireAdmin())) redirect("/admin/reports");
  const [companies, governorates] = await Promise.all([listShippingCompanies(true), getGovernorates()]);

  const serializedCompanies = companies.map((company) => ({
    id: company.id,
    slug: company.slug,
    name: company.name,
    isActive: company.isActive,
    commissionPercent: company.commissionRules[0]?.commissionPercent
      ? Number(company.commissionRules[0].commissionPercent)
      : null,
    defaultFlatFee: company.defaultFlatFee ? Number(company.defaultFlatFee) : null,
  }));

  return (
    <ShippingManager
      companies={serializedCompanies}
      governorates={governorates.map((g) => ({ id: g.id, nameAr: g.nameAr }))}
    />
  );
}
