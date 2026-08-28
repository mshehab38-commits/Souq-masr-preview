"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge, VerifiedBadge } from "@/components/ui/Badge";
import { FilterSelect } from "@/components/ui/Filters";
import { readCookie } from "@/lib/client-cookies";
import { CSRF_COOKIE_NAME } from "@/lib/cookie-names";

type VerificationType = "INDIVIDUAL_SELLER" | "BUSINESS";
type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

interface ProfileViewProps {
  user: {
    name: string | null;
    phone: string;
    role: string;
    phoneVerified: boolean;
    commerceVerified: boolean;
  };
  verificationRequests: {
    id: string;
    type: VerificationType;
    status: VerificationStatus;
    businessName: string | null;
    createdAt: string;
  }[];
}

const STATUS_LABELS: Record<VerificationStatus, { label: string; tone: "amber" | "success" | "danger" }> = {
  PENDING: { label: "قيد المراجعة", tone: "amber" },
  APPROVED: { label: "تم القبول", tone: "success" },
  REJECTED: { label: "مرفوض", tone: "danger" },
};

function csrfHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-csrf-token": readCookie(CSRF_COOKIE_NAME) ?? "",
  };
}

export function ProfileView({ user, verificationRequests }: ProfileViewProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [nameSaved, setNameSaved] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [requestType, setRequestType] = useState<VerificationType>("INDIVIDUAL_SELLER");
  const [businessName, setBusinessName] = useState("");
  const [notes, setNotes] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requests, setRequests] = useState(verificationRequests);

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    setNameSaved(false);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ name }),
      });
      if (response.ok) setNameSaved(true);
    } finally {
      setSavingName(false);
    }
  }

  async function handleSubmitVerification(event: FormEvent) {
    event.preventDefault();
    setRequestError(null);
    setSubmittingRequest(true);
    try {
      const response = await fetch("/api/verification-requests", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({
          type: requestType,
          businessName: requestType === "BUSINESS" ? businessName : undefined,
          notes: notes || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setRequestError(data.error === "business_name_required" ? "اسم النشاط التجاري مطلوب" : "حدث خطأ ما");
        return;
      }
      setRequests((prev) => [
        { id: data.id, type: data.type, status: data.status, businessName: data.businessName, createdAt: data.createdAt },
        ...prev,
      ]);
      setBusinessName("");
      setNotes("");
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", headers: csrfHeaders() });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-cairo text-2xl font-bold text-neutral-900">الملف الشخصي</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          تسجيل الخروج
        </Button>
      </div>

      <Card className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-neutral-600">{user.phone}</span>
          {user.phoneVerified && <VerifiedBadge />}
          {user.commerceVerified && <Badge tone="success">بائع موثّق</Badge>}
        </div>
        <form onSubmit={handleSaveName} className="flex items-end gap-3">
          <div className="flex-1">
            <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" loading={savingName} size="md">
            حفظ
          </Button>
        </form>
        {nameSaved && <p className="text-sm text-success">تم الحفظ بنجاح</p>}
      </Card>

      {!user.commerceVerified && (
        <Card className="mb-6">
          <h2 className="font-cairo mb-3 text-lg font-bold text-neutral-900">طلب توثيق للبيع عبر المنصة</h2>
          <form onSubmit={handleSubmitVerification} className="flex flex-col gap-3">
            <FilterSelect
              label="نوع الحساب"
              value={requestType}
              onChange={(value) => setRequestType(value as VerificationType)}
              options={[
                { value: "INDIVIDUAL_SELLER", label: "بائع فردي موثّق" },
                { value: "BUSINESS", label: "نشاط تجاري / شركة" },
              ]}
            />
            {requestType === "BUSINESS" && (
              <Input
                label="اسم النشاط التجاري"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            )}
            <Input label="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {requestError && <p className="text-sm text-danger">{requestError}</p>}
            <Button type="submit" loading={submittingRequest} className="self-start">
              إرسال طلب التوثيق
            </Button>
          </form>
        </Card>
      )}

      {requests.length > 0 && (
        <Card>
          <h2 className="font-cairo mb-3 text-lg font-bold text-neutral-900">طلبات التوثيق</h2>
          <ul className="flex flex-col gap-2">
            {requests.map((request) => (
              <li key={request.id} className="flex items-center justify-between text-sm">
                <span>{request.type === "BUSINESS" ? request.businessName ?? "نشاط تجاري" : "بائع فردي"}</span>
                <Badge tone={STATUS_LABELS[request.status].tone}>{STATUS_LABELS[request.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
