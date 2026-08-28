"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { readCookie } from "@/lib/client-cookies";
import { CSRF_COOKIE_NAME } from "@/lib/cookie-names";

function csrfHeaders(): HeadersInit {
  return { "Content-Type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE_NAME) ?? "" };
}

interface ListingDetailActionsProps {
  listingId: string;
  isOwner: boolean;
  isSold: boolean;
}

export function ListingDetailActions({ listingId, isOwner, isSold }: ListingDetailActionsProps) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleFavorite() {
    setBusy(true);
    try {
      const response = await fetch(`/api/listings/${listingId}/favorite`, {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setFavorited(data.favorited);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkSold() {
    setBusy(true);
    try {
      await fetch(`/api/listings/${listingId}/sold`, { method: "POST", headers: csrfHeaders() });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await fetch(`/api/listings/${listingId}`, { method: "DELETE", headers: csrfHeaders() });
      router.push("/listings/mine");
    } finally {
      setBusy(false);
    }
  }

  if (isOwner) {
    return (
      <div className="flex gap-3">
        {!isSold && (
          <Button variant="outline" onClick={handleMarkSold} loading={busy}>
            تحديد كمُباع
          </Button>
        )}
        <Button variant="danger" onClick={handleDelete} loading={busy}>
          حذف الإعلان
        </Button>
      </div>
    );
  }

  return (
    <Button variant={favorited ? "accent" : "outline"} onClick={handleToggleFavorite} loading={busy}>
      {favorited ? "مضاف للمفضلة ✓" : "أضف للمفضلة"}
    </Button>
  );
}
