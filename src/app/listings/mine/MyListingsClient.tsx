"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriceTag } from "@/components/ui/PriceTag";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_REVIEW: "قيد المراجعة",
  ACTIVE: "نشط",
  SOLD: "تم البيع",
  EXPIRED: "منتهي",
  REJECTED: "مرفوض",
  REMOVED: "محذوف",
};

export interface MyListingRow {
  id: string;
  title: string;
  price: number | null;
  status: string;
}

export function MyListingsClient({ listings }: { listings: MyListingRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkAction(action: "mark_sold" | "delete" | "relist") {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await fetch("/api/listings/bulk", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ listingIds: Array.from(selected), action }),
      });
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3">
          <span className="text-sm font-medium text-teal-800">
            تم تحديد {selected.size.toLocaleString("ar-EG")}
          </span>
          <Button size="sm" variant="outline" loading={busy} onClick={() => runBulkAction("mark_sold")}>
            تحديد كمُباع
          </Button>
          <Button size="sm" variant="outline" loading={busy} onClick={() => runBulkAction("relist")}>
            إعادة نشر
          </Button>
          <Button size="sm" variant="danger" loading={busy} onClick={() => runBulkAction("delete")}>
            حذف
          </Button>
        </div>
      )}

      {listings.map((listing) => (
        <Card key={listing.id} className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected.has(listing.id)}
            onChange={() => toggle(listing.id)}
            aria-label={`تحديد ${listing.title}`}
            className="h-5 w-5 shrink-0 rounded border-neutral-300 text-teal-600 focus:ring-teal-600"
          />
          <Link href={`/listings/${listing.id}`} className="flex flex-1 items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900">{listing.title}</p>
              {listing.price && <PriceTag amount={listing.price} size="sm" />}
            </div>
            <Badge tone={listing.status === "ACTIVE" ? "success" : "neutral"}>
              {STATUS_LABELS[listing.status]}
            </Badge>
          </Link>
        </Card>
      ))}
    </div>
  );
}
