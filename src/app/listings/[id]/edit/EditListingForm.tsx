"use client";

import { useState, type FormEvent } from "react";
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

interface CityOption {
  id: string;
  nameAr: string;
}

interface GovernorateOption {
  id: string;
  nameAr: string;
  cities: CityOption[];
}

interface ListingToEdit {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  negotiable: boolean;
  governorateId: string | null;
  cityId: string | null;
  attributeValues: Record<string, unknown>;
  categoryNameAr: string;
  attributes: AttributeOption[];
}

interface EditListingFormProps {
  listing: ListingToEdit;
  governorates: GovernorateOption[];
}

export function EditListingForm({ listing, governorates }: EditListingFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description ?? "");
  const [price, setPrice] = useState(listing.price !== null ? String(listing.price) : "");
  const [negotiable, setNegotiable] = useState(listing.negotiable);
  const [governorateId, setGovernorateId] = useState(listing.governorateId ?? "");
  const [cityId, setCityId] = useState(listing.cityId ?? "");
  const [attributeValues, setAttributeValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const attribute of listing.attributes) {
      const raw = listing.attributeValues[attribute.key];
      if (raw === undefined) continue;
      initial[attribute.key] = attribute.type === "BOOLEAN" ? Boolean(raw) : String(raw);
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedGovernorate = governorates.find((governorate) => governorate.id === governorateId);

  function updateAttribute(key: string, value: string | boolean) {
    setAttributeValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const attributes: Record<string, unknown> = {};
      for (const attribute of listing.attributes) {
        const raw = attributeValues[attribute.key];
        if (raw === undefined || raw === "") continue;
        attributes[attribute.key] = attribute.type === "NUMBER" ? Number(raw) : raw;
      }

      const response = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify({
          title,
          description: description || undefined,
          price: price ? Number(price) : undefined,
          negotiable,
          governorateId: governorateId || undefined,
          cityId: cityId || undefined,
          attributes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error === "invalid_attributes") {
          setError((data.details ?? []).join("، "));
        } else {
          setError("تعذر حفظ التعديلات، تحقق من البيانات المدخلة");
        }
        return;
      }

      router.push(`/listings/${listing.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <p className="mb-1 text-sm font-medium text-neutral-700">القسم</p>
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-600">
          {listing.categoryNameAr}
        </p>
      </div>

      <Input label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      <Input label="الوصف" value={description} onChange={(e) => setDescription(e.target.value)} />

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

      {listing.attributes.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 text-sm font-semibold text-neutral-700">تفاصيل إضافية</legend>
          {listing.attributes.map((attribute) => {
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

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" loading={submitting} fullWidth>
        حفظ التعديلات
      </Button>
    </form>
  );
}
