import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

async function loginViaOtp(page: import("@playwright/test").Page, rawPhone: string) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(rawPhone);
  const requestResponse = page.waitForResponse("**/api/auth/otp/request");
  await page.getByRole("button", { name: "إرسال الرمز" }).click();
  const devCode = (await (await requestResponse).json()).devCode as string;
  await page.getByLabel("رمز التحقق").fill(devCode);
  await page.getByRole("button", { name: "تأكيد" }).click();
  await page.waitForURL("**/profile");
}

test.describe("admin audit log: a settings change is visible in /admin/audit-log", () => {
  let adminRawPhone: string;
  let adminPhone: string;

  test.beforeEach(() => {
    adminRawPhone = randomTestPhone("010");
    adminPhone = normalizeEgyptianPhone(adminRawPhone) as string;
  });

  test.afterEach(async () => {
    const admin = await prisma.user.findUnique({ where: { phone: adminPhone } }).catch(() => null);
    if (admin) {
      await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
      await prisma.session.deleteMany({ where: { userId: admin.id } });
      await prisma.user.delete({ where: { id: admin.id } });
    }
    await prisma.platformSettings.updateMany({
      where: { id: "singleton" },
      data: { freeListingActiveLimit: null, updatedBy: null },
    });
  });

  test("changing the free-listing limit produces a settings.update row an admin can see and filter to", async ({
    page,
  }) => {
    await loginViaOtp(page, adminRawPhone);
    const admin = await prisma.user.findUniqueOrThrow({ where: { phone: adminPhone } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN", name: "مدير الاختبار" } });

    // --- make a real, audited change ---
    await page.goto("/admin/settings");
    await page.getByLabel("الحد الأقصى للإعلانات النشطة المجانية").fill("7");
    const saveResponse = page.waitForResponse("**/api/admin/settings");
    await page.getByRole("button", { name: "حفظ الإعدادات" }).click();
    await saveResponse;

    // --- the change is visible, attributed, and filterable in the new audit log page ---
    // Scoped to the newest row (this DB accumulates settings.update rows
    // across every phase's own manual/e2e verification runs, so a bare
    // text match against "settings.update" resolves to many elements —
    // sorting is newest-first, so .first() is this test's own row).
    await page.goto("/admin/audit-log");
    await page.getByLabel("نوع الهدف").selectOption({ label: "الإعدادات العامة" });

    await expect(page.getByText("settings.update", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("مدير الاختبار", { exact: false }).first()).toBeVisible();
    await expect(page.getByText('"freeListingActiveLimit"', { exact: false }).first()).toBeVisible();
  });
});
