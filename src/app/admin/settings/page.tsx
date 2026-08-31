import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/identity/service";
import { getPlatformSettings } from "@/modules/settings/service";
import { SettingsForm } from "./SettingsForm";

// Financial config stays ADMIN-only even though the shared /admin layout
// now admits MODERATOR too — see docs/DECISIONS.md.
export default async function AdminSettingsPage() {
  if (!(await requireAdmin())) redirect("/admin/reports");
  const settings = await getPlatformSettings();

  return (
    <SettingsForm
      freeListingActiveLimit={settings.freeListingActiveLimit}
      paymentProcessingFeeBearer={settings.paymentProcessingFeeBearer}
      requirePrePublishReview={settings.requirePrePublishReview}
    />
  );
}
