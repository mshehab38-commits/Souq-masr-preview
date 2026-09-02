import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

function uniqueTitle(): string {
  return `إعلان مفضل للاختبار ${Math.floor(Math.random() * 1_000_000)}`;
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

test.describe("favorites: favorite a listing from its detail page, manage from /favorites", () => {
  let sellerRawPhone: string;
  let sellerPhone: string;
  let buyerRawPhone: string;
  let buyerPhone: string;

  test.beforeEach(() => {
    sellerRawPhone = randomTestPhone("015");
    sellerPhone = normalizeEgyptianPhone(sellerRawPhone) as string;
    buyerRawPhone = randomTestPhone("011");
    buyerPhone = normalizeEgyptianPhone(buyerRawPhone) as string;
  });

  test.afterEach(async () => {
    const [seller, buyer] = await Promise.all([
      prisma.user.findUnique({ where: { phone: sellerPhone } }).catch(() => null),
      prisma.user.findUnique({ where: { phone: buyerPhone } }).catch(() => null),
    ]);
    if (seller) {
      await prisma.listing.deleteMany({ where: { ownerId: seller.id } });
      await prisma.session.deleteMany({ where: { userId: seller.id } });
      await prisma.user.delete({ where: { id: seller.id } });
    }
    if (buyer) {
      await prisma.favorite.deleteMany({ where: { userId: buyer.id } });
      await prisma.session.deleteMany({ where: { userId: buyer.id } });
      await prisma.user.delete({ where: { id: buyer.id } });
    }
  });

  test("a favorited listing appears on /favorites, its own detail page shows it as favorited, and it can be removed from either place", async ({
    page,
  }) => {
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

    // --- buyer favorites the listing from its detail page ---
    await loginViaOtp(page, buyerRawPhone);
    await page.goto(`/listings/${listingId}`);
    const favoriteResponse = page.waitForResponse(
      (res) => res.url().includes(`/api/listings/${listingId}/favorite`) && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "أضف للمفضلة" }).click();
    await favoriteResponse;
    await expect(page.getByRole("button", { name: "مضاف للمفضلة ✓" })).toBeVisible();

    // --- reloading the detail page still shows it as favorited (proves the
    // initial-state fix — this used to always render "not favorited") ---
    await page.reload();
    await expect(page.getByRole("button", { name: "مضاف للمفضلة ✓" })).toBeVisible();

    // --- it shows up on /favorites ---
    await page.goto("/favorites");
    await expect(page.getByText(title, { exact: false })).toBeVisible();

    // --- removing it from /favorites clears the list ---
    const removeResponse = page.waitForResponse(
      (res) => res.url().includes(`/api/listings/${listingId}/favorite`) && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "إزالة من المفضلة" }).click();
    await removeResponse;
    await expect(page.getByText("لا توجد إعلانات مفضلة بعد")).toBeVisible();

    // --- and the detail page's button reflects that too ---
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByRole("button", { name: "أضف للمفضلة" })).toBeVisible();
  });
});
