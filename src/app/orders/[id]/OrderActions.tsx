"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";
import { ORDER_STATUS_LABELS } from "../order-status-labels";

const DANGER_STATUSES = new Set(["CANCELLED", "FAILED", "RETURNED", "REFUNDED", "DISPUTED"]);

export function OrderActions({ orderId, nextStatuses }: { orderId: string; nextStatuses: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function handleTransition(targetStatus: string) {
    let cancelReason: string | undefined;
    if (targetStatus === "CANCELLED") {
      cancelReason = window.prompt("سبب الإلغاء (اختياري)") ?? undefined;
    }

    setBusy(targetStatus);
    try {
      await fetch(`/api/orders/${orderId}/transition`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ targetStatus, cancelReason }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <Button
          key={status}
          variant={DANGER_STATUSES.has(status) ? "danger" : "primary"}
          loading={busy === status}
          onClick={() => handleTransition(status)}
        >
          {ORDER_STATUS_LABELS[status] ?? status}
        </Button>
      ))}
    </div>
  );
}
