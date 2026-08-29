import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

function uniqueTitle(): string {
  return `إعلان قيد المراجعة للاختبار ${Math.floor(Math.random() * 1_000_000)}`;
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

test.describe("moderation: flag a listing for review, then approve it", () => {
  let sellerRawPhone: string;
  let sellerPhone: string;
  let buyerRawPhone: string;
  let buyerPhone: string;
  let adminRawPhone: string;
  let adminPhone: string;

  test.beforeEach(() => {
    sellerRawPhone = randomTestPhone("012");
    sellerPhone = normalizeEgyptianPhone(sellerRawPhone) as string;
    buyerRawPhone = randomTestPhone("015");
    buyerPhone = normalizeEgyptianPhone(buyerRawPhone) as string;
    adminRawPhone = randomTestPhone("011");
    adminPhone = normalizeEgyptianPhone(adminRawPhone) as string;
  });

  test.afterEach(async () => {
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

  test("flagging hides the listing publicly, and approving from the pending-review queue restores it", async ({
    page,
  }) => {
    const title = uniqueTitle();

    // --- seller creates a plain (contact-only) listing ---
    await loginViaOtp(page, sellerRawPhone);
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("نوع المنتج").fill("سماعة");

    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    const listingId = created.listingId as string;

    await logout(page);

    // --- buyer reports the listing ---
    await loginViaOtp(page, buyerRawPhone);
    await page.goto(`/listings/${listingId}`);
    await page.getByRole("button", { name: "بلاغ عن الإعلان" }).click();
    await page.getByLabel("سبب البلاغ").selectOption({ label: "معلومات مضللة" });
    const reportResponse = page.waitForResponse("**/api/reports");
    await page.getByRole("button", { name: "إرسال البلاغ" }).click();
    await reportResponse;

    await logout(page);

    // --- admin flags the listing for review instead of removing it ---
    await loginViaOtp(page, adminRawPhone);
    const admin = await prisma.user.findUniqueOrThrow({ where: { phone: adminPhone } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });

    await page.goto("/admin/reports");
    await expect(page.getByText(title, { exact: false })).toBeVisible();
    const flagResponse = page.waitForResponse(
      (res) => res.url().includes("/api/admin/reports/") && res.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "تعليق للمراجعة" }).click();
    await flagResponse;

    const flagged = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(flagged.status).toBe("PENDING_REVIEW");
    expect(flagged.deletedAt).toBeNull();

    // The admin (a MODERATOR/ADMIN viewer) can still open it directly...
    const adminView = await page.goto(`/listings/${listingId}`);
    expect(adminView?.status()).toBe(200);

    // ...but a logged-out visitor gets a 404. Checked from a separate
    // browser context (rather than logging the admin out and back in on
    // `page`) so this test only ever requests one OTP per phone number —
    // the identity module's 60s per-phone cooldown would otherwise reject
    // a second login for the same admin phone this soon.
    const anonymousContext = await page.context().browser()!.newContext();
    const anonymousPage = await anonymousContext.newPage();
    const publicView = await anonymousPage.goto(`/listings/${listingId}`);
    expect(publicView?.status()).toBe(404);
    await anonymousContext.close();

    // --- admin (still logged in) approves it from the pending-review queue ---
    await page.goto("/admin/listings/pending-review");
    await expect(page.getByText(title, { exact: false })).toBeVisible();
    const decideResponse = page.waitForResponse(
      (res) => res.url().includes("/api/admin/listings/pending-review/") && res.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "الموافقة وإعادة النشر" }).click();
    await decideResponse;

    const approved = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(approved.status).toBe("ACTIVE");

    await logout(page);
    const restoredView = await page.goto(`/listings/${listingId}`);
    expect(restoredView?.status()).toBe(200);
  });
});
