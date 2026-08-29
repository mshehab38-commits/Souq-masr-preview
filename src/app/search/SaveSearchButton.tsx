"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";

interface SaveSearchButtonProps {
  isLoggedIn: boolean;
  query: {
    q?: string;
    category?: string;
    governorate?: string;
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
  };
}

export function SaveSearchButton({ isLoggedIn, query }: SaveSearchButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error" | "limit_reached">("idle");

  if (!isLoggedIn) return null;

  async function submit() {
    if (!name.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ name: name.trim(), query }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        const data = await res.json().catch(() => null);
        setStatus(data?.error === "limit_reached" ? "limit_reached" : "error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-teal-600 px-4 text-sm font-medium text-teal-700 hover:bg-teal-50"
      >
        حفظ البحث
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="حفظ البحث">
        {status === "done" ? (
          <p className="text-sm text-neutral-700">
            تم حفظ البحث. سنُعلمك عند نشر إعلان جديد يطابقه.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="saved-search-name" className="mb-1.5 block text-sm font-medium text-neutral-700">
                اسم البحث المحفوظ
              </label>
              <input
                id="saved-search-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: شقق حلوان"
                className="h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm"
              />
            </div>
            {status === "error" && <p className="text-sm text-danger">تعذر حفظ البحث، حاول مرة أخرى</p>}
            {status === "limit_reached" && (
              <p className="text-sm text-danger">وصلت للحد الأقصى من عمليات البحث المحفوظة</p>
            )}
            <Button loading={status === "saving"} onClick={submit} disabled={!name.trim()}>
              حفظ
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
