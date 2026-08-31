import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { listListingsByOwner } from "@/modules/catalog/service";
import { EmptyState } from "@/components/ui/States";
import { UrlPagination } from "@/components/ui/UrlPagination";
import { MyListingsClient } from "./MyListingsClient";

interface MyListingsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function MyListingsPage({ searchParams }: MyListingsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = params.page ? Number(params.page) : 1;
  const result = await listListingsByOwner(user.id, { page });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-cairo text-2xl font-bold text-neutral-900">إعلاناتي</h1>
        <Link href="/listings/new" className="text-sm font-medium text-teal-700 hover:underline">
          + إعلان جديد
        </Link>
      </div>

      {result.items.length === 0 ? (
        <EmptyState title="لا توجد إعلانات بعد" description="ابدأ بإضافة أول إعلان لك" />
      ) : (
        <>
          <MyListingsClient
            listings={result.items.map((listing) => ({
              id: listing.id,
              title: listing.title,
              price: listing.price ? Number(listing.price) : null,
              status: listing.status,
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
