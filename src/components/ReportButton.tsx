"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { csrfHeaders } from "@/lib/csrf-headers";

const REASONS = [
  { value: "SPAM", label: "سبام" },
  { value: "PROHIBITED_ITEM", label: "منتج محظور" },
  { value: "FRAUD_SCAM", label: "احتيال" },
  { value: "MISLEADING", label: "معلومات مضللة" },
  { value: "OFFENSIVE_CONTENT", label: "محتوى مسيء" },
  { value: "DUPLICATE", label: "إعلان مكرر" },
  { value: "OTHER", label: "أخرى" },
] as const;

type ReportTarget =
  | { targetType: "LISTING"; listingId: string; label: string }
  | { targetType: "USER"; targetUserId: string; label: string };

export function ReportButton(props: ReportTarget) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("OTHER");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function submit() {
    setStatus("saving");
    try {
      const body =
        props.targetType === "LISTING"
          ? { targetType: "LISTING", listingId: props.listingId, reason, details: details || undefined }
          : { targetType: "USER", targetUserId: props.targetUserId, reason, details: details || undefined };

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify(body),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-neutral-400 hover:text-danger hover:underline"
      >
        {props.label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={props.label}>
        {status === "done" ? (
          <p className="text-sm text-neutral-700">تم إرسال البلاغ، شكراً لك. سيتم مراجعته من فريق سوق مصر.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="report-reason" className="mb-1.5 block text-sm font-medium text-neutral-700">
                سبب البلاغ
              </label>
              <select
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="report-details" className="mb-1.5 block text-sm font-medium text-neutral-700">
                تفاصيل إضافية (اختياري)
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            {status === "error" && <p className="text-sm text-danger">تعذر إرسال البلاغ، حاول مرة أخرى</p>}
            <Button loading={status === "saving"} onClick={submit}>
              إرسال البلاغ
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
