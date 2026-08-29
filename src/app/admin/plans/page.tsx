import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/identity/service";
import { listPlans } from "@/modules/subscriptions/service";
import { PlansManager } from "./PlansManager";

// Financial config stays ADMIN-only even though the shared /admin layout
// now admits MODERATOR too — see docs/DECISIONS.md.
export default async function AdminPlansPage() {
  if (!(await requireAdmin())) redirect("/admin/reports");
  const plans = await listPlans(true);

  const serializedPlans = plans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    nameAr: plan.nameAr,
    nameEn: plan.nameEn,
    monthlyPrice: plan.monthlyPrice ? Number(plan.monthlyPrice) : null,
    yearlyPrice: plan.yearlyPrice ? Number(plan.yearlyPrice) : null,
    activeListingLimit: plan.activeListingLimit,
    isActive: plan.isActive,
  }));

  return <PlansManager plans={serializedPlans} />;
}
