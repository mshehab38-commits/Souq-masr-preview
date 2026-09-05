import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { getListingById, isListingFavorited } from "@/modules/catalog/service";
import { ImageGallery } from "@/components/ui/ImageGallery";
import { PriceTag } from "@/components/ui/PriceTag";
import { Badge, VerifiedBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ListingDetailActions } from "./ListingDetailActions";
import { ListingImageUploader } from "./ListingImageUploader";
import { ReportButton } from "@/components/ReportButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const listing = await getListingById(id, user?.id, user?.role);
  if (!listing) {
    return { title: "الإعلان غير متاح | سوق مصر" };
  }

  const description = listing.description
    ? listing.description.slice(0, 160)
    : `${listing.title} في ${listing.category.nameAr}${listing.governorate ? " - " + listing.governorate.nameAr : ""} على سوق مصر`;

  return {
    title: `${listing.title} - ${listing.category.nameAr} | سوق مصر`,
    description,
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const listing = await getListingById(id, user?.id, user?.role);

  if (!listing) {
    notFound();
  }

  const attributeLabels = new Map(listing.category.attributes.map((attr) => [attr.key, attr]));
  const attributeEntries = Object.entries((listing.attributes as Record<string, unknown>) ?? {});
  const isOwner = user?.id === listing.ownerId;
  const initialFavorited = user && !isOwner ? await isListingFavorited(user.id, listing.id) : false;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <ImageGallery images={listing.images.map((image) => image.fullUrl ?? "")} alt={listing.title} />
          {isOwner && <ListingImageUploader listingId={listing.id} />}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{listing.category.nameAr}</Badge>
            {listing.status === "SOLD" && <Badge tone="danger">تم البيع</Badge>}
          </div>

          <h1 className="font-cairo text-2xl font-bold text-neutral-900">{listing.title}</h1>

          {listing.price && <PriceTag amount={Number(listing.price)} negotiable={listing.negotiable} size="lg" />}

          {(listing.governorate || listing.city) && (
            <p className="text-sm text-neutral-500">
              {listing.city?.nameAr}
              {listing.city && listing.governorate ? "، " : ""}
              {listing.governorate?.nameAr}
            </p>
          )}

          {listing.description && (
            <p className="whitespace-pre-line text-neutral-700">{listing.description}</p>
          )}

          {attributeEntries.length > 0 && (
            <Card>
              <h2 className="font-cairo mb-2 text-base font-bold text-neutral-900">المواصفات</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {attributeEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 border-b border-neutral-100 pb-1">
                    <dt className="text-neutral-500">{attributeLabels.get(key)?.labelAr ?? key}</dt>
                    <dd className="font-medium text-neutral-800">
                      {typeof value === "boolean" ? (value ? "نعم" : "لا") : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          <Card className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-800">{listing.owner.name ?? "معلن"}</p>
              {listing.owner.commerceVerifiedAt && <VerifiedBadge />}
            </div>
            {!isOwner && (
              <a
                href={`https://wa.me/${listing.owner.phone.replace("+", "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-teal-700 hover:underline"
              >
                تواصل عبر واتساب
              </a>
            )}
          </Card>

          {!isOwner && listing.commerceEnabled && listing.status === "ACTIVE" && (
            <Link href={`/listings/${listing.id}/checkout`}>
              <Button fullWidth size="lg">
                اشترِ الآن
              </Button>
            </Link>
          )}

          <ListingDetailActions
            listingId={listing.id}
            isOwner={isOwner}
            isSold={listing.status === "SOLD"}
            initialFavorited={initialFavorited}
          />

          {user && !isOwner && (
            <ReportButton targetType="LISTING" listingId={listing.id} label="بلاغ عن الإعلان" />
          )}
        </div>
      </div>
    </main>
  );
}
