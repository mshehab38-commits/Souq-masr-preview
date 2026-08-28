"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Store } from "@prisma/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { csrfHeaders } from "@/lib/csrf-headers";
import { readCookie } from "@/lib/client-cookies";
import { CSRF_COOKIE_NAME } from "@/lib/cookie-names";

interface StoreSettingsFormProps {
  store: Store | null;
}

export function StoreSettingsForm({ store }: StoreSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(store?.name ?? "");
  const [description, setDescription] = useState(store?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(store ? "/api/stores/mine" : "/api/stores", {
        method: store ? "PATCH" : "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!response.ok) {
        setError("تعذر حفظ بيانات المتجر");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleBrandingUpload(kind: "logo" | "cover", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const setUploading = kind === "logo" ? setUploadingLogo : setUploadingCover;
    setUploading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stores/mine/branding?kind=${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-csrf-token": readCookie(CSRF_COOKIE_NAME) ?? "",
        },
        body: file,
      });
      if (!response.ok) {
        setError("تعذر رفع الصورة، تأكد أنها بصيغة jpg أو png أو webp");
        return;
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  if (!store) {
    return (
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="اسم المتجر"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
          <Input
            label="وصف المتجر (اختياري)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={saving}>
            إنشاء المتجر
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="اسم المتجر"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
          <Input
            label="وصف المتجر (اختياري)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={saving}>
            حفظ التغييرات
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full bg-neutral-100">
            {store.logoUrl && (
              <Image src={store.logoUrl} alt="شعار المتجر" fill sizes="80px" className="object-cover" />
            )}
          </div>
          <label className="inline-flex h-9 w-fit cursor-pointer items-center justify-center rounded-lg border border-teal-600 px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 aria-disabled:pointer-events-none aria-disabled:opacity-50">
            {uploadingLogo ? "جارٍ الرفع..." : "تغيير الشعار"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingLogo}
              onChange={(event) => handleBrandingUpload("logo", event)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative h-32 w-full overflow-hidden rounded-lg bg-neutral-100">
            {store.coverUrl && (
              <Image src={store.coverUrl} alt="غلاف المتجر" fill sizes="100vw" className="object-cover" />
            )}
          </div>
          <label className="inline-flex h-9 w-fit cursor-pointer items-center justify-center rounded-lg border border-teal-600 px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 aria-disabled:pointer-events-none aria-disabled:opacity-50">
            {uploadingCover ? "جارٍ الرفع..." : "تغيير صورة الغلاف"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingCover}
              onChange={(event) => handleBrandingUpload("cover", event)}
            />
          </label>
        </div>
      </Card>
    </div>
  );
}
