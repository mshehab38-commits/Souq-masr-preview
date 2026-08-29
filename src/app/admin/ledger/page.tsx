import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/identity/service";
import { getLedgerSummary, listLedgerEntries } from "@/modules/ledger/service";
import { Card } from "@/components/ui/Card";

const TYPE_LABELS: Record<string, string> = {
  ORDER_PAYMENT_RECEIVED: "دفعة طلب مستلمة",
  SELLER_PAYOUT: "تحويل للبائع",
  SUBSCRIPTION_REVENUE: "إيراد اشتراكات",
  PROMOTED_LISTING_REVENUE: "إيراد إعلانات مميزة",
  SHIPPING_COMMISSION_REVENUE: "عمولة شحن",
  REFUND_ISSUED: "استرداد",
  SHIPPING_COMPANY_SETTLEMENT: "تسوية شركة شحن",
};

// Financial data stays ADMIN-only even though the shared /admin layout now
// admits MODERATOR too — see docs/DECISIONS.md.
export default async function AdminLedgerPage() {
  if (!(await requireAdmin())) redirect("/admin/reports");
  const [summary, entries] = await Promise.all([getLedgerSummary(), listLedgerEntries({}, 50)]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 font-cairo text-lg font-bold text-neutral-900">إجمالي إيرادات المنصة</h2>
        <p className="mb-3 font-cairo text-3xl font-bold text-teal-700">
          {summary.totalPlatformRevenue.toLocaleString("ar-EG")} ج.م
        </p>
        <p className="mb-4 text-sm text-neutral-500">
          لا يشمل هذا الرقم أي جزء من قيمة بيع المنتجات — سوق مصر لا يفرض عمولة على مبيعات
          المنتجات إطلاقاً؛ الإيراد فقط من الاشتراكات والإعلانات المميزة وعمولة شركات الشحن.
        </p>
        <div className="flex flex-col gap-1">
          {Object.entries(summary.platformRevenueByType).map(([type, amount]) => (
            <div key={type} className="flex justify-between text-sm text-neutral-700">
              <span>{TYPE_LABELS[type] ?? type}</span>
              <span className="font-medium">{amount!.toLocaleString("ar-EG")} ج.م</span>
            </div>
          ))}
          {Object.keys(summary.platformRevenueByType).length === 0 && (
            <p className="text-sm text-neutral-500">لا توجد إيرادات مسجلة بعد</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-cairo text-lg font-bold text-neutral-900">أحدث الحركات المالية</h2>
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex justify-between border-b border-neutral-100 pb-2 text-sm last:border-0"
            >
              <div>
                <p className="font-medium text-neutral-900">{TYPE_LABELS[entry.type] ?? entry.type}</p>
                <p className="text-neutral-500">{entry.account}</p>
              </div>
              <span className="font-medium">{Number(entry.amount).toLocaleString("ar-EG")} ج.م</span>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-neutral-500">لا توجد حركات بعد</p>}
        </div>
      </Card>
    </div>
  );
}
