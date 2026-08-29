"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";

interface UserRow {
  id: string;
  name: string | null;
  phone: string;
  role: "INDIVIDUAL" | "BUSINESS" | "MODERATOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  createdAt: string;
}

const STATUS_TONE: Record<UserRow["status"], "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  BANNED: "danger",
};

const STATUS_LABEL: Record<UserRow["status"], string> = {
  ACTIVE: "نشط",
  SUSPENDED: "موقوف",
  BANNED: "محظور",
};

const ROLE_LABEL: Record<UserRow["role"], string> = {
  INDIVIDUAL: "فرد",
  BUSINESS: "نشاط تجاري",
  MODERATOR: "مشرف",
  ADMIN: "مدير",
};

export function UsersDirectory() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (query.trim()) params.set("query", query.trim());

    fetch(`/api/admin/users?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setUsers(data.items ?? []);
        setTotalPages(data.totalPages ?? 1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, page]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Input
          label="بحث بالاسم أو رقم الهاتف"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="ابحث..."
        />
      </Card>

      <Card className="flex flex-col gap-2">
        {loading && <p className="text-sm text-neutral-500">جارٍ التحميل...</p>}
        {!loading && users.length === 0 && <p className="text-sm text-neutral-500">لا يوجد مستخدمون</p>}
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/admin/users/${user.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 hover:bg-neutral-50"
          >
            <div>
              <p className="font-medium text-neutral-900">{user.name ?? "بدون اسم"}</p>
              <p className="text-sm text-neutral-500" dir="ltr">
                {user.phone}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{ROLE_LABEL[user.role]}</Badge>
              <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
            </div>
          </Link>
        ))}
      </Card>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
