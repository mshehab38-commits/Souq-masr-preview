"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";

interface RequestRow {
  id: string;
  reason: string | null;
  createdAt: string;
  user: { id: string; name: string | null; phone: string };
}

export function AccountDeletionQueue() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/account-deletion-requests?status=PENDING");
    if (res.ok) setRequests((await res.json()).items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    setActingOn(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/account-deletion-requests/${id}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "last_admin"
            ? "لا يمكن حذف هذا الحساب لأنه آخر حساب أدمن متبقٍ في المنصة"
            : "تعذر تنفيذ الإجراء",
        );
      }
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-neutral-500">جارٍ التحميل...</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!loading && requests.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">لا توجد طلبات حذف حساب قيد الانتظار</p>
        </Card>
      )}
      {requests.map((request) => (
        <Card key={request.id} className="flex flex-col gap-3">
          <div>
            <p className="font-medium text-neutral-900">{request.user.name ?? request.user.phone}</p>
            <p className="text-sm text-neutral-500" dir="ltr">
              {request.user.phone}
            </p>
          </div>

          {request.reason && <p className="text-sm text-neutral-600">السبب: {request.reason}</p>}

          <div className="flex gap-2 border-t border-neutral-200 pt-3">
            <Button
              size="sm"
              variant="danger"
              loading={actingOn === request.id}
              onClick={() => review(request.id, "APPROVED")}
            >
              موافقة على الحذف
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={actingOn === request.id}
              onClick={() => review(request.id, "REJECTED")}
            >
              رفض
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
