"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { csrfHeaders } from "@/lib/csrf-headers";

export interface CompanyRow {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  commissionPercent: number | null;
  defaultFlatFee: number | null;
}

export interface GovernorateOption {
  id: string;
  nameAr: string;
}

interface RateRow {
  id: string;
  governorateId: string;
  governorate: { nameAr: string };
  flatFee: number;
}

function NewCompanyForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/shipping-companies", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ slug, name }),
      });
      if (!response.ok) {
        setError("تعذر إضافة الشركة — تأكد من عدم تكرار المعرف (slug)");
        return;
      }
      setSlug("");
      setName("");
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-cairo text-lg font-bold text-neutral-900">إضافة شركة شحن</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <Input label="المعرف (slug)" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <Input label="اسم الشركة" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" loading={saving}>
          إضافة
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function RatesEditor({ companyId, governorates }: { companyId: string; governorates: GovernorateOption[] }) {
  const [rates, setRates] = useState<RateRow[] | null>(null);
  const [governorateId, setGovernorateId] = useState(governorates[0]?.id ?? "");
  const [flatFee, setFlatFee] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadRates() {
    const response = await fetch(`/api/admin/shipping-companies/${companyId}/rates`);
    const data = await response.json();
    setRates(data.rates ?? []);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (flatFee.trim() === "" || governorateId === "") return;
    setSaving(true);
    try {
      await fetch(`/api/admin/shipping-companies/${companyId}/rates`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ governorateId, flatFee: Number(flatFee) }),
      });
      setFlatFee("");
      await loadRates();
    } finally {
      setSaving(false);
    }
  }

  if (rates === null) {
    return (
      <Button size="sm" variant="ghost" onClick={loadRates}>
        عرض/تعديل أسعار المحافظات
      </Button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3">
      {rates.length === 0 && (
        <p className="text-sm text-neutral-500">لا توجد أسعار خاصة بمحافظات محددة بعد</p>
      )}
      {rates.map((rate) => (
        <p key={rate.id} className="text-sm text-neutral-700">
          {rate.governorate.nameAr}: {rate.flatFee.toLocaleString("ar-EG")} ج.م
        </p>
      ))}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="font-medium text-neutral-700">المحافظة</label>
          <select
            value={governorateId}
            onChange={(e) => setGovernorateId(e.target.value)}
            className="h-10 rounded-lg border border-neutral-300 bg-white px-3"
          >
            {governorates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameAr}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="السعر (ج.م)"
          type="number"
          min={0}
          value={flatFee}
          onChange={(e) => setFlatFee(e.target.value)}
          placeholder="غير محدد"
        />
        <Button size="sm" type="submit" loading={saving}>
          حفظ السعر
        </Button>
      </form>
    </div>
  );
}

function CompanyCard({
  company,
  governorates,
  onSaved,
}: {
  company: CompanyRow;
  governorates: GovernorateOption[];
  onSaved: () => void;
}) {
  const [commissionPercent, setCommissionPercent] = useState(company.commissionPercent?.toString() ?? "");
  const [defaultFlatFee, setDefaultFlatFee] = useState(company.defaultFlatFee?.toString() ?? "");
  const [isActive, setIsActive] = useState(company.isActive);
  const [saving, setSaving] = useState(false);
  const [savingFee, setSavingFee] = useState(false);

  async function handleSaveCommission() {
    setSaving(true);
    try {
      await fetch(`/api/admin/shipping-companies/${company.id}/commission`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({
          commissionPercent: commissionPercent.trim() === "" ? null : Number(commissionPercent),
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    const next = !isActive;
    setIsActive(next);
    await fetch(`/api/admin/shipping-companies/${company.id}`, {
      method: "PATCH",
      headers: csrfHeaders(),
      body: JSON.stringify({ isActive: next }),
    });
    onSaved();
  }

  async function handleSaveDefaultFee() {
    setSavingFee(true);
    try {
      await fetch(`/api/admin/shipping-companies/${company.id}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({
          defaultFlatFee: defaultFlatFee.trim() === "" ? null : Number(defaultFlatFee),
        }),
      });
      onSaved();
    } finally {
      setSavingFee(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-medium text-neutral-900">{company.name}</p>
          <Badge tone={isActive ? "success" : "neutral"}>{isActive ? "مفعّلة" : "معطّلة"}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={handleToggleActive}>
          {isActive ? "تعطيل" : "تفعيل"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="السعر الافتراضي (ج.م، لكل المحافظات بدون سعر خاص)"
          type="number"
          min={0}
          value={defaultFlatFee}
          onChange={(e) => setDefaultFlatFee(e.target.value)}
          placeholder="غير محدد — لن تُعرض الشركة إلا للمحافظات ذات سعر خاص"
        />
        <Button size="sm" variant="outline" loading={savingFee} onClick={handleSaveDefaultFee}>
          حفظ السعر الافتراضي
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="نسبة عمولة سوق مصر (%)"
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={commissionPercent}
          onChange={(e) => setCommissionPercent(e.target.value)}
          placeholder="غير محدد (0% حالياً)"
          hint={
            company.commissionPercent === null
              ? "⚠️ لم يتم تحديد نسبة بعد — العمولة 0% حتى يتم إدخال النسبة المتفق عليها"
              : undefined
          }
        />
        <Button size="sm" loading={saving} onClick={handleSaveCommission}>
          حفظ العمولة
        </Button>
      </div>

      <RatesEditor companyId={company.id} governorates={governorates} />
    </Card>
  );
}

export function ShippingManager({
  companies,
  governorates,
}: {
  companies: CompanyRow[];
  governorates: GovernorateOption[];
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <NewCompanyForm onCreated={() => router.refresh()} />
      <div className="flex flex-col gap-3">
        {companies.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            governorates={governorates}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}
