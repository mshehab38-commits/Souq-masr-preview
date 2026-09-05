import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getSearchProvider, resolveSearchFilters } from "@/modules/search/service";
import { getCategories, getGovernorates } from "@/modules/catalog/service";
import { getCurrentUser } from "@/modules/identity/service";
import { Card } from "@/components/ui/Card";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/States";
import { SearchPaginationClient } from "./SearchPaginationClient";
import { SaveSearchButton } from "./SaveSearchButton";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    governorate?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const title = q ? `نتائج البحث: ${q} | سوق مصر` : "تصفح الإعلانات | سوق مصر";
  const description = q
    ? `نتائج البحث عن "${q}" في إعلانات سوق مصر المبوبة`
    : "تصفح آلاف الإعلانات المبوبة في سوق مصر — سيارات، عقارات، إلكترونيات وأكثر";
  return { title, description };
}

// A positive, finite number, or undefined for anything else (missing,
// blank, non-numeric, negative) — invalid input is silently ignored
// rather than surfaced as a form error, matching how `sort` already
// falls back to "newest" for any unrecognized value in this file.
function parsePositiveNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

const SORT_OPTIONS = [
  { value: "newest", label: "الأحدث" },
  { value: "price_asc", label: "السعر: من الأقل للأعلى" },
  { value: "price_desc", label: "السعر: من الأعلى للأقل" },
];

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const page = params.page ? Number(params.page) : 1;
  const sort = params.sort === "price_asc" || params.sort === "price_desc" ? params.sort : "newest";
  const minPrice = parsePositiveNumber(params.minPrice);
  const maxPrice = parsePositiveNumber(params.maxPrice);

  const [categories, governorates, filters, user] = await Promise.all([
    getCategories(),
    getGovernorates(),
    resolveSearchFilters({
      q: params.q,
      category: params.category,
      governorate: params.governorate,
      minPrice,
      maxPrice,
      sort,
    }),
    getCurrentUser(),
  ]);

  const result = await getSearchProvider().search(filters, { page, limit: 20 });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-1 flex-col gap-1.5 text-sm">
          <label htmlFor="q" className="font-medium text-neutral-700">
            ابحث
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q}
            placeholder="ابحث عن سلعة..."
            className="h-10 rounded-lg border border-neutral-300 px-3 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="category" className="font-medium text-neutral-700">
            القسم
          </label>
          <select
            id="category"
            name="category"
            defaultValue={params.category ?? ""}
            className="h-10 rounded-lg border border-neutral-300 bg-white px-3"
          >
            <option value="">كل الأقسام</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="governorate" className="font-medium text-neutral-700">
            المحافظة
          </label>
          <select
            id="governorate"
            name="governorate"
            defaultValue={params.governorate ?? ""}
            className="h-10 rounded-lg border border-neutral-300 bg-white px-3"
          >
            <option value="">كل المحافظات</option>
            {governorates.map((governorate) => (
              <option key={governorate.id} value={governorate.slug}>
                {governorate.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="minPrice" className="font-medium text-neutral-700">
            السعر من
          </label>
          <input
            id="minPrice"
            name="minPrice"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={params.minPrice}
            placeholder="بدون حد أدنى"
            className="h-10 w-32 rounded-lg border border-neutral-300 px-3 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="maxPrice" className="font-medium text-neutral-700">
            إلى
          </label>
          <input
            id="maxPrice"
            name="maxPrice"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={params.maxPrice}
            placeholder="بدون حد أقصى"
            className="h-10 w-32 rounded-lg border border-neutral-300 px-3 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="sort" className="font-medium text-neutral-700">
            الترتيب
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={sort}
            className="h-10 rounded-lg border border-neutral-300 bg-white px-3"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-teal-600 px-5 text-sm font-medium text-white hover:bg-teal-700"
        >
          بحث
        </button>
      </form>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">{result.totalCount} نتيجة</p>
        <SaveSearchButton
          isLoggedIn={Boolean(user)}
          query={{
            q: params.q,
            category: params.category,
            governorate: params.governorate,
            minPrice,
            maxPrice,
            sort,
          }}
        />
      </div>

      {result.items.length === 0 ? (
        <EmptyState title="لا توجد نتائج" description="جرّب تعديل كلمات البحث أو الفلاتر" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {result.items.map((item) => (
            <Link key={item.id} href={`/listings/${item.id}`}>
              <Card padded={false} className="overflow-hidden">
                <div className="relative aspect-square w-full bg-neutral-100">
                  {item.thumbnailUrl && (
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="mb-1 line-clamp-2 text-sm font-medium text-neutral-900">{item.title}</p>
                  {item.price !== null && <PriceTag amount={item.price} size="sm" />}
                  {item.cityName && <p className="mt-1 text-xs text-neutral-500">{item.cityName}</p>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8">
        <SearchPaginationClient page={result.page} totalPages={result.totalPages} />
      </div>
    </main>
  );
}
