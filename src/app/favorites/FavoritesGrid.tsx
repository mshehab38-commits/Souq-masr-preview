"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriceTag } from "@/components/ui/PriceTag";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { csrfHeaders } from "@/lib/csrf-headers";

// Mirrors the labels already established in listings/mine/MyListingsClient.tsx
// — a favorited listing can end up in any of these states (sold, expired,
// removed) while still sitting in the viewer's favorites list, so the
// status needs to be shown here too, not assumed ACTIVE.
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_REVIEW: "قيد المراجعة",
  ACTIVE: "نشط",
  SOLD: "تم البيع",
  EXPIRED: "منتهي",
  REJECTED: "مرفوض",
  REMOVED: "محذوف",
};

interface FavoriteListingItem {
  favoriteId: string;
  listingId: string;
  title: string;
  price: number | null;
  negotiable: boolean;
  status: string;
  thumbnailUrl: string | null;
}

export function FavoritesGrid({ favorites }: { favorites: FavoriteListingItem[] }) {
  const [items, setItems] = useState(favorites);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(listingId: string) {
    setRemovingId(listingId);
    try {
      const response = await fetch(`/api/listings/${listingId}/favorite`, {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (response.ok) {
        setItems((current) => current.filter((item) => item.listingId !== listingId));
      }
    } finally {
      setRemovingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="لا توجد إعلانات مفضلة بعد"
        description="اضغط على «أضف للمفضلة» في أي إعلان لتظهر هنا"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.favoriteId} padded={false} className="overflow-hidden">
          <Link href={`/listings/${item.listingId}`}>
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
              {item.status !== "ACTIVE" && (
                <div className="absolute end-2 top-2">
                  <Badge tone="neutral">{STATUS_LABELS[item.status] ?? item.status}</Badge>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="mb-1 line-clamp-2 text-sm font-medium text-neutral-900">{item.title}</p>
              {item.price !== null && <PriceTag amount={item.price} negotiable={item.negotiable} size="sm" />}
            </div>
          </Link>
          <div className="border-t border-neutral-100 p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              loading={removingId === item.listingId}
              onClick={() => handleRemove(item.listingId)}
            >
              إزالة من المفضلة
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
