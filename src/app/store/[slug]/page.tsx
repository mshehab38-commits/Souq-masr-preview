import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getStoreBySlug, listStorePublicListings } from "@/modules/store/service";
import { getCurrentUser } from "@/modules/identity/service";
import { Card } from "@/components/ui/Card";
import { PriceTag } from "@/components/ui/PriceTag";
import { VerifiedBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { StorePaginationClient } from "./StorePaginationClient";
import { ReportButton } from "@/components/ReportButton";

const PAGE_SIZE = 20;

interface StorePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) {
    return { title: "المتجر غير متاح | سوق مصر" };
  }

  return {
    title: `${store.name} | سوق مصر`,
    description: store.description ?? `تصفح إعلانات متجر ${store.name} على سوق مصر`,
  };
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const [store, user] = await Promise.all([getStoreBySlug(slug), getCurrentUser()]);
  if (!store) {
    notFound();
  }

  const { items, total } = await listStorePublicListings(store.ownerId, page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="relative mb-6 h-40 w-full overflow-hidden rounded-xl bg-neutral-100 sm:h-56">
        {store.coverUrl && (
          <Image src={store.coverUrl} alt="" fill sizes="100vw" className="object-cover" />
        )}
      </div>

      <div className="mb-8 flex items-start gap-4">
        <div className="relative -mt-16 h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow-sm sm:h-28 sm:w-28">
          {store.logoUrl && (
            <Image src={store.logoUrl} alt={store.name} fill sizes="112px" className="object-cover" />
          )}
        </div>
        <div className="pt-2">
          <div className="flex items-center gap-2">
            <h1 className="font-cairo text-2xl font-bold text-neutral-900">{store.name}</h1>
            {store.owner.commerceVerifiedAt && <VerifiedBadge />}
          </div>
          {store.description && <p className="mt-1 max-w-2xl text-neutral-600">{store.description}</p>}
        </div>
      </div>

      {user && user.id !== store.ownerId && (
        <div className="mb-6 flex items-center gap-4">
          <a
            href={`https://wa.me/${store.owner.phone.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            تواصل عبر واتساب
          </a>
          <ReportButton targetType="USER" targetUserId={store.ownerId} label="بلاغ عن البائع" />
        </div>
      )}

      <p className="mb-4 text-sm text-neutral-500">{total.toLocaleString("ar-EG")} إعلان نشط</p>

      {items.length === 0 ? (
        <EmptyState title="لا توجد إعلانات حالياً" description="لم يقم هذا البائع بنشر أي إعلانات نشطة بعد" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((listing) => (
            <Link key={listing.id} href={`/listings/${listing.id}`}>
              <Card padded={false} className="overflow-hidden">
                <div className="relative aspect-square w-full bg-neutral-100">
                  {listing.images[0]?.thumbnailUrl && (
                    <Image
                      src={listing.images[0].thumbnailUrl}
                      alt={listing.title}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="mb-1 line-clamp-2 text-sm font-medium text-neutral-900">{listing.title}</p>
                  {listing.price !== null && <PriceTag amount={Number(listing.price)} size="sm" />}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8">
        <StorePaginationClient page={page} totalPages={totalPages} />
      </div>
    </main>
  );
}
