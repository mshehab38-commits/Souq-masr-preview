import { NextResponse } from "next/server";
import { requireAdmin } from "@/modules/identity/service";
import { getLedgerSummary, listLedgerEntries } from "@/modules/ledger/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [summary, recentEntries] = await Promise.all([getLedgerSummary(), listLedgerEntries({}, 50)]);

  return NextResponse.json({ summary, recentEntries });
});
