import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { listSavedSearches } from "@/modules/search/service";
import { EmptyState } from "@/components/ui/States";
import { SavedSearchesClient } from "./SavedSearchesClient";

export default async function SavedSearchesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const savedSearches = await listSavedSearches(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 font-cairo text-2xl font-bold text-neutral-900">عمليات البحث المحفوظة</h1>

      {savedSearches.length === 0 ? (
        <EmptyState
          title="لا توجد عمليات بحث محفوظة"
          description="احفظ بحثًا من صفحة البحث لتصلك إشعارات عند نشر إعلانات جديدة تطابقه"
        />
      ) : (
        <SavedSearchesClient
          savedSearches={savedSearches.map((saved) => ({
            id: saved.id,
            name: saved.name,
            query: saved.query as Record<string, unknown>,
            createdAt: saved.createdAt.toISOString(),
          }))}
        />
      )}
    </main>
  );
}
