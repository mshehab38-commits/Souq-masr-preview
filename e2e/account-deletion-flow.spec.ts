import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

function uniqueTitle(): string {
  return `إعلان حذف حساب للاختبار ${Math.floor(Math.random() * 1_000_000)}`;
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

test.describe("account deletion: seller requests deletion, admin approves it", () => {
  let sellerRawPhone: string;
  let sellerPhone: string;
  let adminRawPhone: string;
  let adminPhone: string;

  test.beforeEach(() => {
    sellerRawPhone = randomTestPhone("015");
    sellerPhone = normalizeEgyptianPhone(sellerRawPhone) as string;
    adminRawPhone = randomTestPhone("010");
    adminPhone = normalizeEgyptianPhone(adminRawPhone) as string;
  });

  test.afterEach(async () => {
    const [seller, admin] = await Promise.all([
      prisma.user.findUnique({ where: { phone: sellerPhone } }).catch(() => null),
      prisma.user.findUnique({ where: { phone: adminPhone } }).catch(() => null),
    ]);
    if (seller) {
      await prisma.accountDeletionRequest.deleteMany({ where: { userId: seller.id } });
      await prisma.listing.deleteMany({ where: { ownerId: seller.id } });
      await prisma.session.deleteMany({ where: { userId: seller.id } });
      await prisma.user.delete({ where: { id: seller.id } });
    }
    if (admin) {
      await prisma.session.deleteMany({ where: { userId: admin.id } });
      await prisma.user.delete({ where: { id: admin.id } });
    }
  });

  test("approving the request locks the seller's session and removes their listing from search", async ({
    page,
    browser,
  }) => {
    const title = uniqueTitle();

    // --- seller signs up and creates a listing ---
    await loginViaOtp(page, sellerRawPhone);
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("نوع المنتج").fill("سماعة");
    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    expect(created.success).toBe(true);

    // --- seller submits a deletion request from /profile (still logged in) ---
    await page.goto("/profile");
    const submitResponse = page.waitForResponse("**/api/account-deletion-requests");
    await page.getByRole("button", { name: "حذف الحساب" }).click();
    const submitted = await (await submitResponse).json();
    expect(submitted.alreadyPending).toBe(false);
    await expect(page.getByText("طلب حذف الحساب قيد المراجعة من قبل الإدارة")).toBeVisible();

    // --- admin, in a separate browser context so the seller's session
    // (kept alive in `page`) is never disturbed, approves the request ---
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginViaOtp(adminPage, adminRawPhone);
    const admin = await prisma.user.findUniqueOrThrow({ where: { phone: adminPhone } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });

    await adminPage.goto("/admin/account-deletion-requests");
    await expect(adminPage.getByText(sellerPhone, { exact: false }).first()).toBeVisible();
    const reviewResponse = adminPage.waitForResponse(
      (res) => res.url().includes("/api/admin/account-deletion-requests/") && res.request().method() === "PATCH",
    );
    await adminPage.getByRole("button", { name: "موافقة على الحذف" }).click();
    await reviewResponse;
    await adminContext.close();

    // --- the seller's still-open session is now locked out ---
    await page.goto("/profile");
    await page.waitForURL("**/login");

    // --- the listing no longer appears in search ---
    await page.goto(`/search?q=${encodeURIComponent(title)}`);
    await expect(page.getByText(title)).not.toBeVisible();
  });
});
