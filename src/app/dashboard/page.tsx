import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { getSellerStats } from "@/modules/catalog/service";
import { getStoreByOwnerId } from "@/modules/store/service";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="font-cairo text-3xl font-bold text-neutral-900">{value.toLocaleString("ar-EG")}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [stats, store] = await Promise.all([getSellerStats(user.id), getStoreByOwnerId(user.id)]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-cairo text-2xl font-bold text-neutral-900">لوحة التحكم</h1>
        <div className="flex gap-2">
          <Link href="/listings/mine">
            <Button variant="outline">إدارة الإعلانات</Button>
          </Link>
          <Link href="/listings/new">
            <Button>+ إعلان جديد</Button>
          </Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="إعلانات نشطة" value={stats.activeCount} />
        <StatCard label="تم بيعها" value={stats.soldCount} />
        <StatCard label="منتهية" value={stats.expiredCount} />
        <StatCard label="مرات المشاهدة" value={stats.totalViews} />
      </div>

      <Card className="flex items-center justify-between">
        {store ? (
          <>
            <div>
              <p className="font-medium text-neutral-900">متجرك: {store.name}</p>
              <p className="text-sm text-neutral-500">
                {stats.favoritesReceived.toLocaleString("ar-EG")} إعجاب على إعلاناتك
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/store/${store.slug}`}>
                <Button variant="outline">معاينة المتجر</Button>
              </Link>
              <Link href="/dashboard/store">
                <Button variant="outline">تعديل المتجر</Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="font-medium text-neutral-900">لم تنشئ متجرك العام بعد</p>
              <p className="text-sm text-neutral-500">أنشئ صفحة متجر لعرض جميع إعلاناتك في مكان واحد</p>
            </div>
            <Link href="/dashboard/store">
              <Button>إنشاء متجر</Button>
            </Link>
          </>
        )}
      </Card>
    </main>
  );
}
