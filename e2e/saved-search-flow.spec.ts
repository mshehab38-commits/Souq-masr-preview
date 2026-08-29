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

test.describe("saved searches: save from /search, manage from /saved-searches", () => {
  let rawPhone: string;
  let phone: string;

  test.beforeEach(() => {
    rawPhone = randomTestPhone("015");
    phone = normalizeEgyptianPhone(rawPhone) as string;
  });

  test.afterEach(async () => {
    const user = await prisma.user.findUnique({ where: { phone } }).catch(() => null);
    if (user) {
      await prisma.savedSearch.deleteMany({ where: { userId: user.id } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  test("a saved search appears on /saved-searches and can be deleted", async ({ page }) => {
    const searchName = `بحث اختباري ${Math.floor(Math.random() * 1_000_000)}`;

    await loginViaOtp(page, rawPhone);
    await page.goto("/search?q=دراجة");

    await page.getByRole("button", { name: "حفظ البحث" }).click();
    await page.getByLabel("اسم البحث المحفوظ").fill(searchName);
    const createResponse = page.waitForResponse("**/api/saved-searches");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await createResponse;
    await expect(page.getByText("تم حفظ البحث")).toBeVisible();

    await page.goto("/saved-searches");
    await expect(page.getByRole("link", { name: searchName })).toBeVisible();

    const deleteResponse = page.waitForResponse(
      (res) => res.url().includes("/api/saved-searches/") && res.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "حذف" }).click();
    await deleteResponse;

    await expect(page.getByText("لا توجد عمليات بحث محفوظة")).toBeVisible();
  });
});
