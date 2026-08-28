import Link from "next/link";
import { getCategories, getGovernorates } from "@/modules/catalog/service";
import { getSearchProvider } from "@/modules/search/service";
import { Logo } from "@/components/brand/Logo";
import { Card } from "@/components/ui/Card";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/States";

export const revalidate = 60;

export default async function HomePage() {
  const [categories, governorates, recent] = await Promise.all([
    getCategories(),
    getGovernorates(),
    getSearchProvider().search({ sort: "newest" }, { page: 1, limit: 8 }),
  ]);
  const cityCount = governorates.reduce((total, gov) => total + gov.cities.length, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 flex flex-col items-center gap-3 text-center">
        <Logo size={48} />
        <p className="max-w-md text-neutral-600">
          سوق مصر — إعلانات مبوّبة ومتجر إلكتروني في مكان واحد
        </p>
      </header>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <div className="font-cairo text-3xl font-bold text-teal-700">{governorates.length}</div>
          <div className="mt-1 text-sm text-neutral-600">محافظة مصرية</div>
        </Card>
        <Card className="text-center">
          <div className="font-cairo text-3xl font-bold text-teal-700">{cityCount}</div>
          <div className="mt-1 text-sm text-neutral-600">مدينة وحي</div>
        </Card>
        <Card className="text-center">
          <div className="font-cairo text-3xl font-bold text-teal-700">{categories.length}</div>
          <div className="mt-1 text-sm text-neutral-600">قسم رئيسي</div>
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="font-cairo mb-4 text-xl font-bold text-neutral-900">الأقسام</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((category) => (
            <Link key={category.id} href={`/search?category=${category.slug}`}>
              <Card className="text-center text-sm font-medium text-neutral-800 hover:border-teal-300">
                {category.nameAr}
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-cairo text-xl font-bold text-neutral-900">أحدث الإعلانات</h2>
          <Link href="/search" className="text-sm font-medium text-teal-700 hover:underline">
            عرض الكل
          </Link>
        </div>
        {recent.items.length === 0 ? (
          <EmptyState
            title="لا توجد إعلانات بعد"
            description="كن أول من ينشر إعلانًا على سوق مصر"
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {recent.items.map((item) => (
              <Link key={item.id} href={`/listings/${item.id}`}>
                <Card padded={false} className="overflow-hidden">
                  <div className="aspect-square w-full bg-neutral-100" />
                  <div className="p-3">
                    <p className="mb-1 line-clamp-2 text-sm font-medium text-neutral-900">{item.title}</p>
                    {item.price !== null && <PriceTag amount={item.price} size="sm" />}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
