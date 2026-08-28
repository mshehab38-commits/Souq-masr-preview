import { getCategories, getGovernorates } from "@/modules/catalog/service";
import { Logo } from "@/components/brand/Logo";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";

export const revalidate = 60;

export default async function HomePage() {
  const [categories, governorates] = await Promise.all([getCategories(), getGovernorates()]);
  const cityCount = governorates.reduce((total, gov) => total + gov.cities.length, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 flex flex-col items-center gap-3 text-center">
        <Logo size={48} />
        <p className="max-w-md text-neutral-600">
          سوق مصر الجديد — إعلانات مبوّبة ومتجر إلكتروني في مكان واحد
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
            <Card key={category.id} className="text-center text-sm font-medium text-neutral-800">
              {category.nameAr}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-cairo text-xl font-bold text-neutral-900">أحدث الإعلانات</h2>
          <Badge tone="amber">قريبًا</Badge>
        </div>
        <EmptyState
          title="الإعلانات قادمة قريبًا"
          description="نعمل حاليًا على بناء نظام الإعلانات والبحث — تابعنا قريبًا"
        />
      </section>
    </main>
  );
}
