import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { listListingsByOwner } from "@/modules/catalog/service";
import { EmptyState } from "@/components/ui/States";
import { MyListingsClient } from "./MyListingsClient";

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const listings = await listListingsByOwner(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-cairo text-2xl font-bold text-neutral-900">إعلاناتي</h1>
        <Link href="/listings/new" className="text-sm font-medium text-teal-700 hover:underline">
          + إعلان جديد
        </Link>
      </div>

      {listings.length === 0 ? (
        <EmptyState title="لا توجد إعلانات بعد" description="ابدأ بإضافة أول إعلان لك" />
      ) : (
        <MyListingsClient
          listings={listings.map((listing) => ({
            id: listing.id,
            title: listing.title,
            price: listing.price ? Number(listing.price) : null,
            status: listing.status,
          }))}
        />
      )}
    </main>
  );
}
