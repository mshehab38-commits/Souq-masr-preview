import { redirect } from "next/navigation";
import Link from "next/link";
import { requireModerator } from "@/modules/identity/service";

// Financial/config pages (settings/plans/shipping/ledger) stay ADMIN-only —
// each of those pages re-checks requireAdmin() itself, since this shared
// shell now admits MODERATOR too (for the trust & safety pages below). See
// docs/DECISIONS.md for why the split lives here instead of one gate.
const NAV_ITEMS = [
  { href: "/admin/settings", label: "الإعدادات العامة" },
  { href: "/admin/plans", label: "خطط الاشتراك" },
  { href: "/admin/shipping", label: "شركات الشحن" },
  { href: "/admin/ledger", label: "الإيرادات" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/reports", label: "البلاغات" },
  { href: "/admin/verification", label: "طلبات التوثيق" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const moderator = await requireModerator();
  if (!moderator) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 font-cairo text-2xl font-bold text-neutral-900">لوحة الإدارة</h1>
      <nav className="mb-8 flex gap-4 border-b border-neutral-200 text-sm font-medium text-neutral-600">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="pb-3 hover:text-teal-700">
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
