import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { listFavoriteListings } from "@/modules/catalog/service";
import { EmptyState } from "@/components/ui/States";
import { UrlPagination } from "@/components/ui/UrlPagination";
import { FavoritesGrid } from "./FavoritesGrid";

interface FavoritesPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function FavoritesPage({ searchParams }: FavoritesPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = params.page ? Number(params.page) : 1;
  const result = await listFavoriteListings(user.id, { page });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 font-cairo text-2xl font-bold text-neutral-900">المفضلة</h1>

      {result.items.length === 0 ? (
        <EmptyState
          title="لا توجد إعلانات مفضلة بعد"
          description="اضغط على «أضف للمفضلة» في أي إعلان لتظهر هنا"
        />
      ) : (
        <>
          <FavoritesGrid
            favorites={result.items.map((favorite) => ({
              favoriteId: favorite.id,
              listingId: favorite.listing.id,
              title: favorite.listing.title,
              price: favorite.listing.price ? Number(favorite.listing.price) : null,
              negotiable: favorite.listing.negotiable,
              status: favorite.listing.status,
              thumbnailUrl: favorite.listing.images[0]?.fullUrl ?? null,
            }))}
          />
          <div className="mt-6">
            <UrlPagination page={result.page} totalPages={result.totalPages} />
          </div>
        </>
      )}
    </main>
  );
}
