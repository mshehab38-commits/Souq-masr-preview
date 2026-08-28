"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/Filters";
import { csrfHeaders } from "@/lib/csrf-headers";

type AttributeType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

interface AttributeOption {
  key: string;
  labelAr: string;
  type: AttributeType;
  required: boolean;
  options: { value: string; labelAr: string }[];
}

interface CategoryOption {
  id: string;
  nameAr: string;
  commerceDefault: "ELIGIBLE" | "NOT_ELIGIBLE" | "ADMIN_REVIEW";
  attributes: AttributeOption[];
}

interface CityOption {
  id: string;
  nameAr: string;
}

interface GovernorateOption {
  id: string;
  nameAr: string;
  cities: CityOption[];
}

interface NewListingFormProps {
  categories: CategoryOption[];
  governorates: GovernorateOption[];
  sellerCommerceVerified: boolean;
}

const FULFILLMENT_LABELS: Record<string, string> = {
  SELF_ARRANGED: "استلام أو توصيل يتم الاتفاق عليه مباشرة",
  PLATFORM_SHIPPING: "شحن عبر المنصة",
  SELLER_DELIVERY: "توصيل يقوم به البائع",
};

export function NewListingForm({ categories, governorates, sellerCommerceVerified }: NewListingFormProps) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [governorateId, setGovernorateId] = useState("");
  const [cityId, setCityId] = useState("");
  const [attributeValues, setAttributeValues] = useState<Record<string, string | boolean>>({});
  const [commerceEnabled, setCommerceEnabled] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState("SELF_ARRANGED");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const selectedGovernorate = governorates.find((governorate) => governorate.id === governorateId);

  const commerceOfferable = useMemo(
    () => sellerCommerceVerified && selectedCategory?.commerceDefault === "ELIGIBLE",
    [sellerCommerceVerified, selectedCategory],
  );

  function updateAttribute(key: string, value: string | boolean) {
    setAttributeValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const attributes: Record<string, unknown> = {};
      for (const attribute of selectedCategory?.attributes ?? []) {
        const raw = attributeValues[attribute.key];
        if (raw === undefined || raw === "") continue;
        attributes[attribute.key] = attribute.type === "NUMBER" ? Number(raw) : raw;
      }

      const response = await fetch("/api/listings", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({
          categoryId,
          title,
          description: description || undefined,
          price: price ? Number(price) : undefined,
          negotiable,
          governorateId: governorateId || undefined,
          cityId: cityId || undefined,
          attributes,
          commerceEnabled: commerceOfferable ? commerceEnabled : false,
          fulfillmentMode: commerceOfferable && commerceEnabled ? fulfillmentMode : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === "invalid_attributes") {
          setError((data.details ?? []).join("، "));
        } else if (data.error === "listing_limit_reached") {
          setError(
            `لقد وصلت إلى الحد الأقصى لعدد الإعلانات النشطة المجانية (${data.limit}). يمكنك ترقية حسابك لنشر المزيد.`,
          );
        } else {
          setError("تعذر نشر الإعلان، تحقق من البيانات المدخلة");
        }
        return;
      }

      router.push(`/listings/${data.listingId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <FilterSelect
        label="القسم"
        value={categoryId}
        onChange={setCategoryId}
        options={categories.map((category) => ({ value: category.id, label: category.nameAr }))}
      />

      <Input label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      <Input
        label="الوصف"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="السعر (ج.م)"
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-neutral-700">
          <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />
          قابل للتفاوض
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FilterSelect
          label="المحافظة"
          value={governorateId}
          onChange={(value) => {
            setGovernorateId(value);
            setCityId("");
          }}
          options={[{ value: "", label: "اختر المحافظة" }, ...governorates.map((g) => ({ value: g.id, label: g.nameAr }))]}
        />
        <FilterSelect
          label="المدينة"
          value={cityId}
          onChange={setCityId}
          options={[
            { value: "", label: "اختر المدينة" },
            ...(selectedGovernorate?.cities.map((city) => ({ value: city.id, label: city.nameAr })) ?? []),
          ]}
        />
      </div>

      {selectedCategory && selectedCategory.attributes.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 text-sm font-semibold text-neutral-700">تفاصيل إضافية</legend>
          {selectedCategory.attributes.map((attribute) => {
            if (attribute.type === "BOOLEAN") {
              return (
                <label key={attribute.key} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={Boolean(attributeValues[attribute.key])}
                    onChange={(e) => updateAttribute(attribute.key, e.target.checked)}
                  />
                  {attribute.labelAr}
                </label>
              );
            }
            if (attribute.type === "SELECT") {
              return (
                <FilterSelect
                  key={attribute.key}
                  label={attribute.labelAr}
                  value={String(attributeValues[attribute.key] ?? "")}
                  onChange={(value) => updateAttribute(attribute.key, value)}
                  options={[
                    { value: "", label: "اختر" },
                    ...attribute.options.map((option) => ({ value: option.value, label: option.labelAr })),
                  ]}
                />
              );
            }
            return (
              <Input
                key={attribute.key}
                label={attribute.labelAr}
                type={attribute.type === "NUMBER" ? "number" : "text"}
                required={attribute.required}
                value={String(attributeValues[attribute.key] ?? "")}
                onChange={(e) => updateAttribute(attribute.key, e.target.value)}
              />
            );
          })}
        </fieldset>
      )}

      {commerceOfferable && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-teal-800">
            <input
              type="checkbox"
              checked={commerceEnabled}
              onChange={(e) => setCommerceEnabled(e.target.checked)}
            />
            تفعيل الشراء المباشر (دفع وشحن عبر المنصة)
          </label>
          {commerceEnabled && (
            <FilterSelect
              label="طريقة التوصيل"
              value={fulfillmentMode}
              onChange={setFulfillmentMode}
              options={Object.entries(FULFILLMENT_LABELS).map(([value, label]) => ({ value, label }))}
            />
          )}
        </fieldset>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" loading={submitting} fullWidth>
        نشر الإعلان
      </Button>
    </form>
  );
}
