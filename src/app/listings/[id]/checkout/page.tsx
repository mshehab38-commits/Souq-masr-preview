import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { getListingById, getGovernorates } from "@/modules/catalog/service";
import { isOnlinePaymentConfigured } from "@/modules/payments/service";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/listings/${id}/checkout`);
  }

  const [listing, governorates] = await Promise.all([getListingById(id), getGovernorates()]);

  if (!listing || !listing.commerceEnabled || listing.status !== "ACTIVE") {
    notFound();
  }
  if (listing.ownerId === user.id) {
    redirect(`/listings/${id}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 font-cairo text-2xl font-bold text-neutral-900">إتمام الشراء</h1>
      <CheckoutForm
        listingId={listing.id}
        title={listing.title}
        price={Number(listing.price)}
        fulfillmentMode={listing.fulfillmentMode as "SELF_ARRANGED" | "PLATFORM_SHIPPING" | "SELLER_DELIVERY"}
        governorates={governorates.map((g) => ({
          id: g.id,
          nameAr: g.nameAr,
          cities: g.cities.map((c) => ({ id: c.id, nameAr: c.nameAr })),
        }))}
        onlinePaymentAvailable={isOnlinePaymentConfigured()}
      />
    </main>
  );
}
