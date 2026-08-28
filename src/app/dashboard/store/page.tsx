import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { getStoreByOwnerId } from "@/modules/store/service";
import { StoreSettingsForm } from "./StoreSettingsForm";

export default async function StoreSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const store = await getStoreByOwnerId(user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-cairo text-2xl font-bold text-neutral-900">إعدادات المتجر</h1>
      <StoreSettingsForm store={store} />
    </main>
  );
}
