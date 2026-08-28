import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { getCategories, getGovernorates } from "@/modules/catalog/service";
import { NewListingForm } from "./NewListingForm";

export default async function NewListingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [categories, governorates] = await Promise.all([getCategories(), getGovernorates()]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-cairo mb-6 text-2xl font-bold text-neutral-900">إضافة إعلان جديد</h1>
      <NewListingForm
        categories={categories.map((category) => ({
          id: category.id,
          nameAr: category.nameAr,
          commerceDefault: category.commerceDefault,
          attributes: category.attributes.map((attribute) => ({
            key: attribute.key,
            labelAr: attribute.labelAr,
            type: attribute.type,
            required: attribute.required,
            options: (attribute.options as { value: string; labelAr: string }[] | null) ?? [],
          })),
        }))}
        governorates={governorates.map((governorate) => ({
          id: governorate.id,
          nameAr: governorate.nameAr,
          cities: governorate.cities.map((city) => ({ id: city.id, nameAr: city.nameAr })),
        }))}
        sellerCommerceVerified={user.commerceVerifiedAt !== null}
      />
    </main>
  );
}
