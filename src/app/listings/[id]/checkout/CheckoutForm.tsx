"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PriceTag } from "@/components/ui/PriceTag";
import { FilterSelect } from "@/components/ui/Filters";
import { csrfHeaders } from "@/lib/csrf-headers";

interface CityOption {
  id: string;
  nameAr: string;
}

interface GovernorateOption {
  id: string;
  nameAr: string;
  cities: CityOption[];
}

interface ShippingOption {
  companyId: string;
  companyName: string;
  fee: number;
}

interface CheckoutFormProps {
  listingId: string;
  title: string;
  price: number;
  fulfillmentMode: "SELF_ARRANGED" | "PLATFORM_SHIPPING" | "SELLER_DELIVERY";
  governorates: GovernorateOption[];
  onlinePaymentAvailable: boolean;
}

const FULFILLMENT_LABELS: Record<string, string> = {
  SELF_ARRANGED: "استلام أو توصيل يتم الاتفاق عليه مباشرة مع البائع",
  PLATFORM_SHIPPING: "شحن عبر شركة شحن متعاقدة مع المنصة",
  SELLER_DELIVERY: "توصيل يقوم به البائع",
};

export function CheckoutForm({
  listingId,
  title,
  price,
  fulfillmentMode,
  governorates,
  onlinePaymentAvailable,
}: CheckoutFormProps) {
  const router = useRouter();
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorateId, setGovernorateId] = useState("");
  const [cityId, setCityId] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [shippingCompanyId, setShippingCompanyId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_DELIVERY" | "ONLINE">("CASH_ON_DELIVERY");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresShipping = fulfillmentMode === "PLATFORM_SHIPPING";
  const selectedGovernorate = governorates.find((g) => g.id === governorateId);

  useEffect(() => {
    if (!requiresShipping || !governorateId) {
      setShippingOptions([]);
      setShippingCompanyId("");
      return;
    }
    fetch(`/api/shipping-options?governorateId=${governorateId}`)
      .then((res) => res.json())
      .then((data) => {
        setShippingOptions(data.options ?? []);
        setShippingCompanyId(data.options?.[0]?.companyId ?? "");
      });
  }, [requiresShipping, governorateId]);

  const selectedShippingFee = shippingOptions.find((o) => o.companyId === shippingCompanyId)?.fee ?? 0;
  const totalAmount = useMemo(
    () => price + (requiresShipping ? selectedShippingFee : 0),
    [price, requiresShipping, selectedShippingFee],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (requiresShipping && !shippingCompanyId) {
      setError("لا تتوفر شركة شحن لهذه المحافظة حالياً");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({
          listingId,
          paymentMethod,
          shippingCompanyId: requiresShipping ? shippingCompanyId : undefined,
          shippingAddress: {
            recipientName,
            phone,
            governorateId: governorateId || undefined,
            cityId: cityId || undefined,
            addressLine: addressLine || undefined,
          },
          buyerNote: buyerNote || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(
          data.error === "shipping_rate_unavailable"
            ? "لا تتوفر شركة شحن لهذه المحافظة حالياً"
            : data.error === "listing_already_sold"
              ? "تم بيع هذا الإعلان لمشترٍ آخر للتو"
              : "تعذر إتمام الطلب، حاول مرة أخرى",
        );
        return;
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      router.push(`/orders/${data.orderId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center justify-between">
        <div>
          <p className="font-medium text-neutral-900">{title}</p>
          <p className="text-sm text-neutral-500">{FULFILLMENT_LABELS[fulfillmentMode]}</p>
        </div>
        <PriceTag amount={price} size="md" />
      </Card>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="اسم المستلم"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          required
        />
        <Input label="رقم الهاتف" value={phone} onChange={(e) => setPhone(e.target.value)} required />

        <div className="grid grid-cols-2 gap-3">
          <FilterSelect
            label="المحافظة"
            value={governorateId}
            onChange={(value) => {
              setGovernorateId(value);
              setCityId("");
            }}
            options={[
              { value: "", label: "اختر المحافظة" },
              ...governorates.map((g) => ({ value: g.id, label: g.nameAr })),
            ]}
          />
          <FilterSelect
            label="المدينة"
            value={cityId}
            onChange={setCityId}
            options={[
              { value: "", label: "اختر المدينة" },
              ...(selectedGovernorate?.cities.map((c) => ({ value: c.id, label: c.nameAr })) ?? []),
            ]}
          />
        </div>

        <Input
          label="العنوان بالتفصيل"
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
        />

        {requiresShipping && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">شركة الشحن</label>
            {governorateId === "" ? (
              <p className="text-sm text-neutral-500">اختر المحافظة أولاً لعرض شركات الشحن المتاحة</p>
            ) : shippingOptions.length === 0 ? (
              <p className="text-sm text-danger">لا تتوفر شركة شحن لهذه المحافظة حالياً</p>
            ) : (
              <FilterSelect
                label=""
                value={shippingCompanyId}
                onChange={setShippingCompanyId}
                options={shippingOptions.map((option) => ({
                  value: option.companyId,
                  label: `${option.companyName} — ${option.fee.toLocaleString("ar-EG")} ج.م`,
                }))}
              />
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-neutral-700">طريقة الدفع</label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="radio"
              checked={paymentMethod === "CASH_ON_DELIVERY"}
              onChange={() => setPaymentMethod("CASH_ON_DELIVERY")}
            />
            الدفع عند الاستلام
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="radio"
              disabled={!onlinePaymentAvailable}
              checked={paymentMethod === "ONLINE"}
              onChange={() => setPaymentMethod("ONLINE")}
            />
            الدفع الإلكتروني {!onlinePaymentAvailable && "(قريباً)"}
          </label>
        </div>

        <Input
          label="ملاحظات إضافية (اختياري)"
          value={buyerNote}
          onChange={(e) => setBuyerNote(e.target.value)}
        />

        <Card className="flex items-center justify-between">
          <span className="font-medium text-neutral-700">الإجمالي</span>
          <PriceTag amount={totalAmount} size="md" />
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" loading={submitting} fullWidth size="lg">
          تأكيد الطلب
        </Button>
      </form>
    </div>
  );
}
