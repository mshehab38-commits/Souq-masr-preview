import { getCategories, getGovernorates } from "@/modules/catalog/service";

export const revalidate = 60;

export default async function HomePage() {
  const [categories, governorates] = await Promise.all([getCategories(), getGovernorates()]);
  const cityCount = governorates.reduce((total, gov) => total + gov.cities.length, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 text-center">
        <h1 className="font-cairo text-4xl font-extrabold text-emerald-700">سوق مصر</h1>
        <p className="mt-2 text-neutral-600">
          الأساس التقني للمنصة — المرحلة الأولى: البنية التحتية وقاعدة البيانات
        </p>
      </header>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <div className="font-cairo text-3xl font-bold text-emerald-700">{governorates.length}</div>
          <div className="mt-1 text-sm text-neutral-600">محافظة مصرية</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <div className="font-cairo text-3xl font-bold text-emerald-700">{cityCount}</div>
          <div className="mt-1 text-sm text-neutral-600">مدينة وحي</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <div className="font-cairo text-3xl font-bold text-emerald-700">{categories.length}</div>
          <div className="mt-1 text-sm text-neutral-600">قسم رئيسي</div>
        </div>
      </section>

      <section>
        <h2 className="font-cairo mb-4 text-xl font-bold">الأقسام</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((category) => (
            <li
              key={category.id}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-medium shadow-sm"
            >
              {category.nameAr}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
