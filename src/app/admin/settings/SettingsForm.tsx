"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PaymentFeeBearer } from "@prisma/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { csrfHeaders } from "@/lib/csrf-headers";

interface SettingsFormProps {
  freeListingActiveLimit: number | null;
  paymentProcessingFeeBearer: PaymentFeeBearer | null;
}

export function SettingsForm({ freeListingActiveLimit, paymentProcessingFeeBearer }: SettingsFormProps) {
  const router = useRouter();
  const [limitInput, setLimitInput] = useState(freeListingActiveLimit?.toString() ?? "");
  const [feeBearer, setFeeBearer] = useState(paymentProcessingFeeBearer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({
          freeListingActiveLimit: limitInput.trim() === "" ? null : Number(limitInput),
          paymentProcessingFeeBearer: feeBearer === "" ? null : feeBearer,
        }),
      });
      if (!response.ok) {
        setError("تعذر حفظ الإعدادات");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <Input
            label="الحد الأقصى للإعلانات النشطة المجانية"
            type="number"
            min={0}
            placeholder="غير محدد (بدون حد حالياً)"
            value={limitInput}
            onChange={(event) => setLimitInput(event.target.value)}
            hint={
              freeListingActiveLimit === null
                ? "⚠️ لم يتم تحديد قيمة بعد — لا يوجد حالياً أي حد أقصى (يتطلب إعداد المالك)"
                : undefined
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="feeBearer" className="text-sm font-medium text-neutral-700">
            جهة تحمّل رسوم بوابة الدفع الإلكتروني
          </label>
          <select
            id="feeBearer"
            value={feeBearer}
            onChange={(event) => setFeeBearer(event.target.value as PaymentFeeBearer | "")}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="">غير محدد (لا يوجد تأثير حالياً — الدفع عند الاستلام فقط)</option>
            <option value="PLATFORM">سوق مصر</option>
            <option value="SELLER">البائع</option>
            <option value="BUYER">المشتري</option>
          </select>
          {paymentProcessingFeeBearer === null && (
            <p className="text-sm text-neutral-500">
              ⚠️ لم يتم تحديد قيمة بعد — لا يوجد تأثير حالياً لعدم وجود بوابة دفع إلكتروني فعّالة
              (الدفع عند الاستلام هو الخيار الوحيد المتاح)
            </p>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={saving} className="self-start">
          حفظ الإعدادات
        </Button>
      </form>
    </Card>
  );
}
