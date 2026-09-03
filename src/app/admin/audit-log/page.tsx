import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/identity/service";
import { AuditLogViewer } from "./AuditLogViewer";

// Audit entries routinely carry financial-adjacent metadata (settings,
// shipping commission, subscription plan changes) — stays ADMIN-only,
// same as settings/plans/shipping/ledger, even though the shared
// /admin layout now admits MODERATOR too. See docs/DECISIONS.md.
export default async function AdminAuditLogPage() {
  if (!(await requireAdmin())) redirect("/admin/reports");
  return <AuditLogViewer />;
}
