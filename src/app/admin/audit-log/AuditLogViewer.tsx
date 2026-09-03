"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";

interface AuditLogRow {
  id: string;
  createdAt: string;
  actorType: "USER" | "SYSTEM";
  actor: { id: string; name: string | null; phone: string } | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
}

// The real, curated list of targetType strings actually written by
// recordAudit() call sites across the codebase (grepped, not invented) —
// see docs/DECISIONS.md's Phase 31 entry.
const TARGET_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "User", label: "مستخدم" },
  { value: "Listing", label: "إعلان" },
  { value: "Order", label: "طلب" },
  { value: "Store", label: "متجر" },
  { value: "Report", label: "بلاغ" },
  { value: "VerificationRequest", label: "طلب توثيق" },
  { value: "PlatformSettings", label: "الإعدادات العامة" },
  { value: "SubscriptionPlan", label: "خطة اشتراك" },
  { value: "Subscription", label: "اشتراك" },
  { value: "ShippingCompany", label: "شركة شحن" },
  { value: "ShippingRate", label: "سعر شحن" },
  { value: "ShippingCommissionRule", label: "عمولة شحن" },
  { value: "ShippingSettlement", label: "تسوية شحن" },
];

function actorLabel(row: AuditLogRow): string {
  if (row.actorType === "SYSTEM") return "النظام";
  if (row.actor) return row.actor.name ?? row.actor.phone;
  return "مستخدم محذوف";
}

function targetLink(row: AuditLogRow): { href: string } | null {
  if (!row.targetId) return null;
  if (row.targetType === "User") return { href: `/admin/users/${row.targetId}` };
  if (row.targetType === "Listing") return { href: `/listings/${row.targetId}` };
  return null;
}

export function AuditLogViewer() {
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (action.trim()) params.set("action", action.trim());
    if (targetType) params.set("targetType", targetType);

    fetch(`/api/admin/audit-log?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setTotalPages(data.totalPages ?? 1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, targetType, page]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Input
            label="الإجراء"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="مثال: settings.update"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="auditTargetType" className="text-sm font-medium text-neutral-700">
            نوع الهدف
          </label>
          <select
            id="auditTargetType"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="">كل الأنواع</option>
            {TARGET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        {loading && <p className="text-sm text-neutral-500">جارٍ التحميل...</p>}
        {!loading && items.length === 0 && <p className="text-sm text-neutral-500">لا توجد سجلات</p>}
        {items.map((row) => {
          const link = targetLink(row);
          return (
            <div key={row.id} className="flex flex-col gap-1 border-b border-neutral-100 pb-3 text-sm last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-900">{actorLabel(row)}</span>
                <span className="text-xs text-neutral-400">
                  {new Date(row.createdAt).toLocaleString("ar-EG")}
                </span>
              </div>
              <p className="font-mono text-xs text-neutral-600" dir="ltr">
                {row.action}
              </p>
              {row.targetType && (
                <p className="text-neutral-500">
                  الهدف:{" "}
                  {link ? (
                    <Link href={link.href} target="_blank" className="text-teal-700 hover:underline">
                      {row.targetType} ({row.targetId})
                    </Link>
                  ) : (
                    `${row.targetType}${row.targetId ? ` (${row.targetId})` : ""}`
                  )}
                </p>
              )}
              {row.metadata != null && (
                <pre className="overflow-x-auto rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600" dir="ltr">
                  {JSON.stringify(row.metadata, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </Card>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
