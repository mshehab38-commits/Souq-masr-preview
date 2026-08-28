import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `012${suffix}`;
}

function uniqueTitle(): string {
  return `موبايل اختبار المتجر ${Math.floor(Math.random() * 1_000_000)}`;
}

function uniqueStoreName(): string {
  return `متجر اختبار ${Math.floor(Math.random() * 1_000_000)}`;
}

test.describe("seller dashboard: create store, view storefront, bulk-manage listings", () => {
  let rawPhone: string;
  let normalizedPhone: string;

  test.beforeEach(() => {
    rawPhone = randomTestPhone();
    normalizedPhone = normalizeEgyptianPhone(rawPhone) as string;
  });

  test.afterEach(async () => {
    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (user) {
      await prisma.listing.deleteMany({ where: { ownerId: user.id } });
      await prisma.store.deleteMany({ where: { ownerId: user.id } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  test("a seller can create a store, see it publicly, and bulk-mark a listing as sold", async ({ page }) => {
    const title = uniqueTitle();
    const storeName = uniqueStoreName();

    // --- sign in ---
    await page.goto("/login");
    await page.getByLabel("رقم الهاتف").fill(rawPhone);
    const requestResponse = page.waitForResponse("**/api/auth/otp/request");
    await page.getByRole("button", { name: "إرسال الرمز" }).click();
    const devCode = (await (await requestResponse).json()).devCode as string;
    await page.getByLabel("رمز التحقق").fill(devCode);
    await page.getByRole("button", { name: "تأكيد" }).click();
    await page.waitForURL("**/profile");

    // --- create a listing to manage later ---
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("السعر (ج.م)").fill("2000");
    await page.getByLabel("نوع المنتج").fill("موبايل");
    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    expect(created.success).toBe(true);

    // --- dashboard shows the active listing in its stats ---
    await page.goto("/dashboard");
    await expect(page.getByText("لم تنشئ متجرك العام بعد")).toBeVisible();

    // --- create the store from the dashboard ---
    await page.goto("/dashboard/store");
    await page.getByLabel("اسم المتجر").fill(storeName);
    const storeCreateResponse = page.waitForResponse("**/api/stores");
    await page.getByRole("button", { name: "إنشاء المتجر" }).click();
    const storeCreated = await (await storeCreateResponse).json();
    expect(storeCreated.success).toBe(true);
    const slug = storeCreated.slug as string;

    // --- the public storefront shows the store and the active listing ---
    await page.goto(`/store/${slug}`);
    await expect(page.getByRole("heading", { name: storeName })).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();

    // --- bulk-mark the listing as sold from /listings/mine ---
    await page.goto("/listings/mine");
    await page.getByLabel(`تحديد ${title}`).check();
    const bulkResponse = page.waitForResponse("**/api/listings/bulk");
    await page.getByRole("button", { name: "تحديد كمُباع" }).click();
    const bulkResult = await (await bulkResponse).json();
    expect(bulkResult.affected).toBe(1);

    // --- the sold listing drops off the public storefront ---
    await page.goto(`/store/${slug}`);
    await expect(page.getByText(title)).not.toBeVisible();
    await expect(page.getByText("لا توجد إعلانات حالياً")).toBeVisible();
  });
});
