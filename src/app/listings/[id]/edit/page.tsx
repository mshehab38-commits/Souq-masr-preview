import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { getListingById } from "@/modules/catalog/service";
import { getGovernorates } from "@/modules/catalog/service";
import { EditListingForm } from "./EditListingForm";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const listing = await getListingById(id, user?.id, user?.role);

  if (!listing) {
    notFound();
  }
  if (!user || user.id !== listing.ownerId) {
    redirect(`/listings/${id}`);
  }

  const governorates = await getGovernorates();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-cairo mb-6 text-2xl font-bold text-neutral-900">تعديل الإعلان</h1>
      <EditListingForm
        listing={{
          id: listing.id,
          title: listing.title,
          description: listing.description,
          price: listing.price ? Number(listing.price) : null,
          negotiable: listing.negotiable,
          governorateId: listing.governorateId,
          cityId: listing.cityId,
          attributeValues: (listing.attributes as Record<string, unknown>) ?? {},
          categoryNameAr: listing.category.nameAr,
          attributes: listing.category.attributes.map((attribute) => ({
            key: attribute.key,
            labelAr: attribute.labelAr,
            type: attribute.type,
            required: attribute.required,
            options: (attribute.options as { value: string; labelAr: string }[] | null) ?? [],
          })),
        }}
        governorates={governorates.map((governorate) => ({
          id: governorate.id,
          nameAr: governorate.nameAr,
          cities: governorate.cities.map((city) => ({ id: city.id, nameAr: city.nameAr })),
        }))}
      />
    </main>
  );
}
