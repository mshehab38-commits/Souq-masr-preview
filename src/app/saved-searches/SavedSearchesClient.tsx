"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";

export interface SavedSearchRow {
  id: string;
  name: string;
  query: Record<string, unknown>;
  createdAt: string;
}

function buildSearchHref(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function SavedSearchesClient({ savedSearches }: { savedSearches: SavedSearchRow[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/saved-searches/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {savedSearches.map((saved) => (
        <Card key={saved.id} className="flex items-center justify-between gap-3">
          <div>
            <Link href={buildSearchHref(saved.query)} className="font-medium text-teal-700 hover:underline">
              {saved.name}
            </Link>
            <p className="mt-1 text-xs text-neutral-400">
              {new Date(saved.createdAt).toLocaleDateString("ar-EG")}
            </p>
          </div>
          <Button
            size="sm"
            variant="danger"
            loading={deletingId === saved.id}
            onClick={() => handleDelete(saved.id)}
          >
            حذف
          </Button>
        </Card>
      ))}
    </div>
  );
}
