import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

function uniqueTitle(): string {
  return `إعلان مخالف للاختبار ${Math.floor(Math.random() * 1_000_000)}`;
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

async function logout(page: import("@playwright/test").Page) {
  await page.goto("/profile");
  const logoutButton = page.getByRole("button", { name: /تسجيل الخروج/ });
  if (await logoutButton.count()) {
    await logoutButton.click();
  }
}

test.describe("moderation: report a listing and remove it", () => {
  let sellerRawPhone: string;
  let sellerPhone: string;
  let buyerRawPhone: string;
  let buyerPhone: string;
  let adminRawPhone: string;
  let adminPhone: string;

  test.beforeEach(() => {
    sellerRawPhone = randomTestPhone("015");
    sellerPhone = normalizeEgyptianPhone(sellerRawPhone) as string;
    buyerRawPhone = randomTestPhone("011");
    buyerPhone = normalizeEgyptianPhone(buyerRawPhone) as string;
    adminRawPhone = randomTestPhone("010");
    adminPhone = normalizeEgyptianPhone(adminRawPhone) as string;
  });

  test.afterEach(async () => {
    // Each lookup is independent (not a single sequential await chain) so a
    // problem with one fixture's phone never prevents the other two from
    // being cleaned up — this bit a prior version of this spec when an
    // invalid phone prefix made one lookup throw before the rest ran.
    const [seller, buyer, admin] = await Promise.all([
      prisma.user.findUnique({ where: { phone: sellerPhone } }).catch(() => null),
      prisma.user.findUnique({ where: { phone: buyerPhone } }).catch(() => null),
      prisma.user.findUnique({ where: { phone: adminPhone } }).catch(() => null),
    ]);
    if (seller) {
      await prisma.report.deleteMany({ where: { listing: { ownerId: seller.id } } });
      await prisma.listing.deleteMany({ where: { ownerId: seller.id } });
      await prisma.session.deleteMany({ where: { userId: seller.id } });
      await prisma.user.delete({ where: { id: seller.id } });
    }
    if (buyer) {
      await prisma.report.deleteMany({ where: { reporterId: buyer.id } });
      await prisma.session.deleteMany({ where: { userId: buyer.id } });
      await prisma.user.delete({ where: { id: buyer.id } });
    }
    if (admin) {
      await prisma.session.deleteMany({ where: { userId: admin.id } });
      await prisma.user.delete({ where: { id: admin.id } });
    }
  });

  test("buyer reports a listing, admin sees it in the queue and removes it", async ({ page }) => {
    const title = uniqueTitle();

    // --- seller signs up and creates a plain (contact-only) listing ---
    await loginViaOtp(page, sellerRawPhone);
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("نوع المنتج").fill("سماعة");

    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    expect(created.success).toBe(true);
    const listingId = created.listingId as string;

    await logout(page);

    // --- buyer reports the listing from the detail page ---
    await loginViaOtp(page, buyerRawPhone);
    await page.goto(`/listings/${listingId}`);
    await page.getByRole("button", { name: "بلاغ عن الإعلان" }).click();
    await page.getByLabel("سبب البلاغ").selectOption({ label: "منتج محظور" });

    const reportResponse = page.waitForResponse("**/api/reports");
    await page.getByRole("button", { name: "إرسال البلاغ" }).click();
    const reportData = await (await reportResponse).json();
    expect(reportData.report.status).toBe("OPEN");

    await logout(page);

    // --- admin (granted directly, matching the checkout-flow shortcut for
    // roles that have no self-serve path yet) reviews the queue and removes
    // the listing ---
    await loginViaOtp(page, adminRawPhone);
    const admin = await prisma.user.findUniqueOrThrow({ where: { phone: adminPhone } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });

    await page.goto("/admin/reports");
    await expect(page.getByText(title, { exact: false })).toBeVisible();

    const resolveResponse = page.waitForResponse((res) => res.url().includes("/api/admin/reports/") && res.request().method() === "PATCH");
    await page.getByRole("button", { name: "حذف الإعلان" }).click();
    await resolveResponse;

    // --- verify: listing is removed and no longer publicly reachable ---
    const removedListing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(removedListing.status).toBe("REMOVED");
    expect(removedListing.deletedAt).not.toBeNull();

    const response = await page.goto(`/listings/${listingId}`);
    expect(response?.status()).toBe(404);

    const updatedReport = await prisma.report.findFirstOrThrow({ where: { listingId } });
    expect(updatedReport.status).toBe("ACTION_TAKEN");
  });
});
