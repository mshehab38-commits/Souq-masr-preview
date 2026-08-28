import { getPlatformSettings } from "@/modules/settings/service";
import { SettingsForm } from "./SettingsForm";

export default async function AdminSettingsPage() {
  const settings = await getPlatformSettings();

  return (
    <SettingsForm
      freeListingActiveLimit={settings.freeListingActiveLimit}
      paymentProcessingFeeBearer={settings.paymentProcessingFeeBearer}
    />
  );
}
