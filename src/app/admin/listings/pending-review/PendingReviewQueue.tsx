"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";

interface PendingListingRow {
  id: string;
  title: string;
  price: string | null;
  createdAt: string;
  owner: { id: string; name: string | null; phone: string };
}

export function PendingReviewQueue() {
  const [listings, setListings] = useState<PendingListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/listings/pending-review");
    if (res.ok) setListings((await res.json()).items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(listingId: string, decision: "APPROVE" | "REJECT") {
    setActingOn(listingId);
    try {
      const res = await fetch(`/api/admin/listings/pending-review/${listingId}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ decision }),
      });
      if (res.ok) await load();
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-neutral-500">جارٍ التحميل...</p>}
      {!loading && listings.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">لا توجد إعلانات معلقة للمراجعة</p>
        </Card>
      )}
      {listings.map((listing) => (
        <Card key={listing.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Link
              href={`/listings/${listing.id}`}
              target="_blank"
              className="text-sm font-medium text-teal-700 hover:underline"
            >
              {listing.title}
            </Link>
            <span className="text-xs text-neutral-400">
              {new Date(listing.createdAt).toLocaleDateString("ar-EG")}
            </span>
          </div>

          <p className="text-sm text-neutral-500">
            البائع: {listing.owner.name ?? listing.owner.phone}
          </p>

          <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
            <Button
              size="sm"
              variant="outline"
              loading={actingOn === listing.id}
              onClick={() => decide(listing.id, "APPROVE")}
            >
              الموافقة وإعادة النشر
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={actingOn === listing.id}
              onClick={() => decide(listing.id, "REJECT")}
            >
              رفض الإعلان
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
