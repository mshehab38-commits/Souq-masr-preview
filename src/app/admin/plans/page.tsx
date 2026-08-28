import { listPlans } from "@/modules/subscriptions/service";
import { PlansManager } from "./PlansManager";

export default async function AdminPlansPage() {
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
