"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-headers";

export function ListingImageUploader({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const targetResponse = await fetch(`/api/listings/${listingId}/images/upload-url`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ contentType: file.type }),
      });
      const target = await targetResponse.json();
      if (!targetResponse.ok) {
        setError("نوع الصورة غير مدعوم");
        return;
      }

      await fetch(target.uploadUrl, {
        method: "PUT",
        headers: target.headers,
        body: file,
      });

      await fetch(`/api/listings/${listingId}/images/confirm`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ key: target.key }),
      });

      // Processing happens asynchronously in the background worker; give it
      // a moment before refreshing so the new image is likely ready.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex h-9 w-fit cursor-pointer items-center justify-center rounded-lg border border-teal-600 px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 aria-disabled:pointer-events-none aria-disabled:opacity-50">
        {uploading ? "جارٍ الرفع..." : "+ إضافة صورة"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={handleFileChange}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
