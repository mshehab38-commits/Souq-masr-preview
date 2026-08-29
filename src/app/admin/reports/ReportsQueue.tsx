"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { csrfHeaders } from "@/lib/csrf-headers";

const REASON_LABEL: Record<string, string> = {
  SPAM: "سبام",
  PROHIBITED_ITEM: "منتج محظور",
  FRAUD_SCAM: "احتيال",
  MISLEADING: "معلومات مضللة",
  OFFENSIVE_CONTENT: "محتوى مسيء",
  DUPLICATE: "إعلان مكرر",
  OTHER: "أخرى",
};

interface ReportRow {
  id: string;
  targetType: "LISTING" | "USER";
  reason: string;
  details: string | null;
  createdAt: string;
  reporter: { id: string; name: string | null; phone: string };
  listing: { id: string; title: string; status: string } | null;
  targetUser: { id: string; name: string | null; phone: string; status: string } | null;
}

export function ReportsQueue() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [reportsRes, profileRes] = await Promise.all([
      fetch("/api/admin/reports?status=OPEN"),
      fetch("/api/profile"),
    ]);
    if (reportsRes.ok) setReports((await reportsRes.json()).items ?? []);
    if (profileRes.ok) setViewerRole((await profileRes.json()).role);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(reportId: string, body: Record<string, unknown>) {
    setActingOn(reportId);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: csrfHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } finally {
      setActingOn(null);
    }
  }

  const isAdmin = viewerRole === "ADMIN";

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-neutral-500">جارٍ التحميل...</p>}
      {!loading && reports.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">لا توجد بلاغات مفتوحة</p>
        </Card>
      )}
      {reports.map((report) => (
        <Card key={report.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <Badge tone="warning">{REASON_LABEL[report.reason] ?? report.reason}</Badge>
              <span className="ms-2 text-sm text-neutral-500">
                بلاغ من {report.reporter.name ?? report.reporter.phone}
              </span>
            </div>
            <span className="text-xs text-neutral-400">
              {new Date(report.createdAt).toLocaleDateString("ar-EG")}
            </span>
          </div>

          {report.targetType === "LISTING" && report.listing && (
            <Link
              href={`/listings/${report.listing.id}`}
              target="_blank"
              className="text-sm font-medium text-teal-700 hover:underline"
            >
              الإعلان: {report.listing.title} ({report.listing.status})
            </Link>
          )}
          {report.targetType === "USER" && report.targetUser && (
            <Link
              href={`/admin/users/${report.targetUser.id}`}
              className="text-sm font-medium text-teal-700 hover:underline"
            >
              المستخدم: {report.targetUser.name ?? report.targetUser.phone} ({report.targetUser.status})
            </Link>
          )}

          {report.details && <p className="text-sm text-neutral-600">{report.details}</p>}

          <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
            <Button
              size="sm"
              variant="outline"
              loading={actingOn === report.id}
              onClick={() => resolve(report.id, { decision: "DISMISS" })}
            >
              تجاهل البلاغ
            </Button>
            {report.targetType === "LISTING" && (
              <Button
                size="sm"
                variant="danger"
                loading={actingOn === report.id}
                onClick={() => resolve(report.id, { decision: "ACTION_TAKEN", action: "REMOVE_LISTING" })}
              >
                حذف الإعلان
              </Button>
            )}
            {report.targetType === "USER" && isAdmin && (
              <Button
                size="sm"
                variant="danger"
                loading={actingOn === report.id}
                onClick={() => resolve(report.id, { decision: "ACTION_TAKEN", action: "SUSPEND_USER" })}
              >
                إيقاف المستخدم
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
