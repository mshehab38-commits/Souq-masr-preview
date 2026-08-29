"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { csrfHeaders } from "@/lib/csrf-headers";

type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";
type UserRole = "INDIVIDUAL" | "BUSINESS" | "MODERATOR" | "ADMIN";

interface UserDetailData {
  user: {
    id: string;
    name: string | null;
    phone: string;
    role: UserRole;
    status: UserStatus;
    commerceVerifiedAt: string | null;
    createdAt: string;
  };
  listingCount: number;
  buyerOrderCount: number;
  sellerOrderCount: number;
  reportsMadeCount: number;
  reportsReceivedCount: number;
}

const STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: "نشط", SUSPENDED: "موقوف", BANNED: "محظور" };
const ROLE_LABEL: Record<UserRole, string> = {
  INDIVIDUAL: "فرد",
  BUSINESS: "نشاط تجاري",
  MODERATOR: "مشرف",
  ADMIN: "مدير",
};

export function UserDetail({ userId }: { userId: string }) {
  const [data, setData] = useState<UserDetailData | null>(null);
  const [viewerRole, setViewerRole] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [detailRes, profileRes] = await Promise.all([
      fetch(`/api/admin/users/${userId}`),
      fetch("/api/profile"),
    ]);
    if (detailRes.ok) setData(await detailRes.json());
    if (profileRes.ok) setViewerRole((await profileRes.json()).role);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdminViewer = viewerRole === "ADMIN";

  async function changeStatus(status: UserStatus) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError("تعذر تنفيذ الإجراء");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(role: UserRole) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "last_admin" ? "لا يمكن إزالة صفة المدير عن آخر مدير في المنصة" : "تعذر تنفيذ الإجراء");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p className="text-sm text-neutral-500">جارٍ التحميل...</p>;

  const { user } = data;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-cairo text-lg font-bold text-neutral-900">{user.name ?? "بدون اسم"}</p>
            <p className="text-sm text-neutral-500" dir="ltr">
              {user.phone}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge tone="neutral">{ROLE_LABEL[user.role]}</Badge>
            <Badge tone={user.status === "ACTIVE" ? "success" : user.status === "SUSPENDED" ? "warning" : "danger"}>
              {STATUS_LABEL[user.status]}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-neutral-200 pt-3 text-sm text-neutral-700 sm:grid-cols-4">
          <p>إعلانات: {data.listingCount}</p>
          <p>طلبات شراء: {data.buyerOrderCount}</p>
          <p>طلبات بيع: {data.sellerOrderCount}</p>
          <p>بلاغات ضده: {data.reportsReceivedCount}</p>
        </div>
      </Card>

      {isAdminViewer && (
        <Card className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">حالة الحساب</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" loading={saving} onClick={() => changeStatus("ACTIVE")}>
                تفعيل
              </Button>
              <Button size="sm" variant="outline" loading={saving} onClick={() => changeStatus("SUSPENDED")}>
                إيقاف مؤقت
              </Button>
              <Button size="sm" variant="danger" loading={saving} onClick={() => changeStatus("BANNED")}>
                حظر
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">الصلاحية</p>
            <div className="flex flex-wrap gap-2">
              {(["INDIVIDUAL", "BUSINESS", "MODERATOR", "ADMIN"] as UserRole[]).map((role) => (
                <Button
                  key={role}
                  size="sm"
                  variant={user.role === role ? "primary" : "outline"}
                  loading={saving}
                  onClick={() => changeRole(role)}
                >
                  {ROLE_LABEL[role]}
                </Button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
      )}

      {!isAdminViewer && (
        <p className="text-sm text-neutral-500">
          تغيير حالة الحساب أو الصلاحية متاح للمديرين فقط.
        </p>
      )}
    </div>
  );
}
