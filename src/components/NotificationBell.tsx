"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { csrfHeaders } from "@/lib/csrf-headers";

const POLL_INTERVAL_MS = 30_000;

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
    setUnreadCount(data.unreadCount ?? 0);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleItemClick(item: NotificationRow) {
    if (!item.readAt) {
      await fetch(`/api/notifications/${item.id}`, { method: "PATCH", headers: csrfHeaders() });
      await load();
    }
    setOpen(false);
  }

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST", headers: csrfHeaders() });
    await load();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        className="relative rounded-full p-2 text-neutral-600 hover:bg-neutral-100 hover:text-teal-700"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 8a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 12 6 8z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 17.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="font-cairo text-sm font-bold text-neutral-900">الإشعارات</p>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-teal-700 hover:underline">
                تعليم الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">لا توجد إشعارات</p>
            )}
            {items.map((item) => {
              const content = (
                <div
                  className={`flex flex-col gap-0.5 border-b border-neutral-50 px-4 py-3 text-sm last:border-0 hover:bg-neutral-50 ${
                    !item.readAt ? "bg-teal-50/50" : ""
                  }`}
                >
                  <p className="font-medium text-neutral-900">{item.title}</p>
                  {item.body && <p className="text-neutral-500">{item.body}</p>}
                </div>
              );
              return item.link ? (
                <Link key={item.id} href={item.link} onClick={() => handleItemClick(item)}>
                  {content}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className="block w-full text-start"
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
