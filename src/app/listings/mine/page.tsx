import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { listListingsByOwner } from "@/modules/catalog/service";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/States";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_REVIEW: "قيد المراجعة",
  ACTIVE: "نشط",
  SOLD: "تم البيع",
  EXPIRED: "منتهي",
  REJECTED: "مرفوض",
  REMOVED: "محذوف",
};

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
        <div className="flex flex-col gap-3">
          {listings.map((listing) => (
            <Link key={listing.id} href={`/listings/${listing.id}`}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-900">{listing.title}</p>
                  {listing.price && <PriceTag amount={Number(listing.price)} size="sm" />}
                </div>
                <Badge tone={listing.status === "ACTIVE" ? "success" : "neutral"}>
                  {STATUS_LABELS[listing.status]}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
