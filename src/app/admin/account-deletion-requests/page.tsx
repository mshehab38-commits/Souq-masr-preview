import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/identity/service";
import { AccountDeletionQueue } from "./AccountDeletionQueue";

// ADMIN-only (not the looser requireModerator() the shared /admin layout
// admits) — approving a request permanently locks the account and
// cascades across the user's listings and store, at least as
// consequential as settings/plans/shipping/ledger/audit-log, which use
// this same page-level re-check. See docs/DECISIONS.md (Phase 34).
export default async function AdminAccountDeletionRequestsPage() {
  if (!(await requireAdmin())) redirect("/admin/reports");
  return <AccountDeletionQueue />;
}
