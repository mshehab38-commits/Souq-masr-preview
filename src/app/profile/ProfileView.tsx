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
    email: string | null;
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
  pendingDeletionRequest: { id: string } | null;
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

export function ProfileView({ user, verificationRequests, pendingDeletionRequest }: ProfileViewProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [requestType, setRequestType] = useState<VerificationType>("INDIVIDUAL_SELLER");
  const [businessName, setBusinessName] = useState("");
  const [notes, setNotes] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requests, setRequests] = useState(verificationRequests);

  const [deletionReason, setDeletionReason] = useState("");
  const [deletionRequest, setDeletionRequest] = useState(pendingDeletionRequest);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [submittingDeletion, setSubmittingDeletion] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    setNameSaved(false);
    setEmailError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({ name, email }),
      });
      if (response.ok) {
        setNameSaved(true);
      } else {
        const data = await response.json().catch(() => null);
        if (data?.error === "invalid_email") setEmailError("البريد الإلكتروني غير صالح");
      }
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
      if (data.alreadyPending) {
        setRequestError("لديك طلب توثيق قيد المراجعة بالفعل");
        return;
      }
      setRequests((prev) => [
        {
          id: data.request.id,
          type: data.request.type,
          status: data.request.status,
          businessName: data.request.businessName,
          createdAt: data.request.createdAt,
        },
        ...prev,
      ]);
      setBusinessName("");
      setNotes("");
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleRequestDeletion(event: FormEvent) {
    event.preventDefault();
    setDeletionError(null);
    setSubmittingDeletion(true);
    try {
      const response = await fetch("/api/account-deletion-requests", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ reason: deletionReason || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        setDeletionError("حدث خطأ ما");
        return;
      }
      setDeletionRequest({ id: data.request.id });
    } finally {
      setSubmittingDeletion(false);
    }
  }

  async function handleCancelDeletion() {
    if (!deletionRequest) return;
    setCancellingDeletion(true);
    try {
      const response = await fetch(`/api/account-deletion-requests/${deletionRequest.id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (response.ok) {
        setDeletionRequest(null);
        setDeletionReason("");
      }
    } finally {
      setCancellingDeletion(false);
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
        <form onSubmit={handleSaveName} className="flex flex-col gap-3">
          <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="البريد الإلكتروني (اختياري)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError ?? undefined}
            hint="يُستخدم فقط لإرسال إشعارات الطلبات والمراجعة — لا يُستخدم لتسجيل الدخول"
          />
          <Button type="submit" loading={savingName} size="md" className="self-start">
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
        <Card className="mb-6">
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

      <Card>
        <h2 className="font-cairo mb-3 text-lg font-bold text-neutral-900">حذف الحساب</h2>
        {deletionRequest ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-600">طلب حذف الحساب قيد المراجعة من قبل الإدارة</p>
            <Button
              variant="outline"
              size="sm"
              loading={cancellingDeletion}
              onClick={handleCancelDeletion}
              className="self-start"
            >
              إلغاء الطلب
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRequestDeletion} className="flex flex-col gap-3">
            <p className="text-sm text-neutral-600">
              لا يمكنك حذف حسابك مباشرة — سيتم مراجعة طلبك من قبل الإدارة، وفي حالة الموافقة سيتم حذف حسابك وجميع
              إعلاناتك ومتجرك بشكل نهائي.
            </p>
            <Input
              label="سبب الحذف (اختياري)"
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
            />
            {deletionError && <p className="text-sm text-danger">{deletionError}</p>}
            <Button type="submit" variant="danger" loading={submittingDeletion} className="self-start">
              حذف الحساب
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
