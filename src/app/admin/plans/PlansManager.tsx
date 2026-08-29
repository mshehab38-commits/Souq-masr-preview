"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { csrfHeaders } from "@/lib/csrf-headers";

export interface PlanRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  activeListingLimit: number | null;
  isActive: boolean;
}

function priceLabel(value: number | null): string {
  return value === null ? "لم يُحدَّد بعد (مطلوب إعداد المالك)" : `${value.toLocaleString("ar-EG")} ج.م`;
}

function NewPlanForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/plans", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ slug, nameAr, nameEn }),
      });
      if (!response.ok) {
        setError("تعذر إنشاء الخطة — تأكد من عدم تكرار المعرف (slug)");
        return;
      }
      setSlug("");
      setNameAr("");
      setNameEn("");
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-cairo text-lg font-bold text-neutral-900">إضافة خطة جديدة</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <Input
          label="المعرف (slug)"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          required
          placeholder="business-pro"
        />
        <Input
          label="الاسم بالعربية"
          value={nameAr}
          onChange={(event) => setNameAr(event.target.value)}
          required
        />
        <Input
          label="الاسم بالإنجليزية"
          value={nameEn}
          onChange={(event) => setNameEn(event.target.value)}
          required
        />
        <Button type="submit" loading={saving}>
          إضافة
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-3 text-sm text-neutral-500">
        الأسعار وحدود الإعلانات فارغة افتراضياً — يجب تحديدها لاحقاً من زر &quot;تعديل&quot;؛ لا يمكن
        الاشتراك في خطة بدون سعر محدد.
      </p>
    </Card>
  );
}

function EditPlanRow({ plan, onSaved }: { plan: PlanRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState(plan.monthlyPrice?.toString() ?? "");
  const [yearlyPrice, setYearlyPrice] = useState(plan.yearlyPrice?.toString() ?? "");
  const [activeListingLimit, setActiveListingLimit] = useState(plan.activeListingLimit?.toString() ?? "");
  const [isActive, setIsActive] = useState(plan.isActive);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({
          monthlyPrice: monthlyPrice.trim() === "" ? null : Number(monthlyPrice),
          yearlyPrice: yearlyPrice.trim() === "" ? null : Number(yearlyPrice),
          activeListingLimit: activeListingLimit.trim() === "" ? null : Number(activeListingLimit),
          isActive,
        }),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-900">{plan.nameAr}</p>
            <Badge tone={plan.isActive ? "success" : "neutral"}>
              {plan.isActive ? "مفعّلة" : "معطّلة"}
            </Badge>
          </div>
          <p className="text-sm text-neutral-500">
            شهرياً: {priceLabel(plan.monthlyPrice)} · سنوياً: {priceLabel(plan.yearlyPrice)} · حد
            الإعلانات:{" "}
            {plan.activeListingLimit === null ? "بدون حد" : plan.activeListingLimit.toLocaleString("ar-EG")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          تعديل
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="font-medium text-neutral-900">{plan.nameAr}</p>
      <div className="flex flex-wrap gap-3">
        <Input
          label="السعر الشهري (ج.م)"
          type="number"
          min={0}
          value={monthlyPrice}
          onChange={(event) => setMonthlyPrice(event.target.value)}
          placeholder="غير محدد"
        />
        <Input
          label="السعر السنوي (ج.م)"
          type="number"
          min={0}
          value={yearlyPrice}
          onChange={(event) => setYearlyPrice(event.target.value)}
          placeholder="غير محدد"
        />
        <Input
          label="حد الإعلانات النشطة"
          type="number"
          min={0}
          value={activeListingLimit}
          onChange={(event) => setActiveListingLimit(event.target.value)}
          placeholder="بدون حد"
        />
      </div>
      <label className="flex w-fit items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-teal-600 focus:ring-teal-600"
        />
        الخطة مفعّلة ومتاحة
      </label>
      <div className="flex gap-2">
        <Button size="sm" loading={saving} onClick={handleSave}>
          حفظ
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          إلغاء
        </Button>
      </div>
    </Card>
  );
}

function GrantSubscriptionForm({ plans }: { plans: PlanRow[] }) {
  const [userPhone, setUserPhone] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ userPhone, planId, billingCycle }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(
          data.error === "plan_not_priced"
            ? "لا يمكن منح هذه الخطة — لم يتم تحديد سعرها بعد"
            : "تعذر منح الاشتراك — تأكد من رقم الهاتف",
        );
        return;
      }
      setMessage("تم منح الاشتراك بنجاح");
      setUserPhone("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-cairo text-lg font-bold text-neutral-900">منح اشتراك يدوياً</h2>
      <p className="mb-4 text-sm text-neutral-500">
        الشراء الذاتي عبر بوابة دفع غير مفعّل بعد — يُستخدم هذا لمنح اشتراك بعد ترتيب دفع يدوي مع
        البائع.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <Input
          label="رقم هاتف البائع"
          value={userPhone}
          onChange={(event) => setUserPhone(event.target.value)}
          required
          placeholder="01xxxxxxxxx"
        />
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="planId" className="font-medium text-neutral-700">
            الخطة
          </label>
          <select
            id="planId"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="billingCycle" className="font-medium text-neutral-700">
            الدورة
          </label>
          <select
            id="billingCycle"
            value={billingCycle}
            onChange={(event) => setBillingCycle(event.target.value as "MONTHLY" | "YEARLY")}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3"
          >
            <option value="MONTHLY">شهري</option>
            <option value="YEARLY">سنوي</option>
          </select>
        </div>
        <Button type="submit" loading={saving}>
          منح الاشتراك
        </Button>
      </form>
      {message && <p className="mt-2 text-sm text-neutral-700">{message}</p>}
    </Card>
  );
}

export function PlansManager({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <NewPlanForm onCreated={() => router.refresh()} />
      <div className="flex flex-col gap-3">
        {plans.map((plan) => (
          <EditPlanRow key={plan.id} plan={plan} onSaved={() => router.refresh()} />
        ))}
      </div>
      {plans.length > 0 && <GrantSubscriptionForm plans={plans} />}
    </div>
  );
}
