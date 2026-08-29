"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { csrfHeaders } from "@/lib/csrf-headers";

interface RequestRow {
  id: string;
  type: "INDIVIDUAL_SELLER" | "BUSINESS";
  businessName: string | null;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string | null; phone: string; role: string };
}

export function VerificationQueue() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/verification-requests?status=PENDING");
    if (res.ok) setRequests((await res.json()).items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    setActingOn(id);
    try {
      const res = await fetch(`/api/admin/verification-requests/${id}`, {
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
      {!loading && requests.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">لا توجد طلبات توثيق قيد الانتظار</p>
        </Card>
      )}
      {requests.map((request) => (
        <Card key={request.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-neutral-900">{request.user.name ?? request.user.phone}</p>
              <p className="text-sm text-neutral-500" dir="ltr">
                {request.user.phone}
              </p>
            </div>
            <Badge tone="teal">{request.type === "BUSINESS" ? "نشاط تجاري" : "بائع فردي"}</Badge>
          </div>

          {request.businessName && (
            <p className="text-sm text-neutral-700">اسم النشاط: {request.businessName}</p>
          )}
          {request.notes && <p className="text-sm text-neutral-600">{request.notes}</p>}

          <div className="flex gap-2 border-t border-neutral-200 pt-3">
            <Button size="sm" loading={actingOn === request.id} onClick={() => review(request.id, "APPROVED")}>
              قبول
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
