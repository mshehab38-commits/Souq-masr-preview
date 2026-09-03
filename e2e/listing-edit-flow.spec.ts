import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

function uniqueTitle(): string {
  return `إعلان تعديل للاختبار ${Math.floor(Math.random() * 1_000_000)}`;
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

test.describe("listing edit: seller edits their own listing, non-owner is redirected away", () => {
  let sellerRawPhone: string;
  let sellerPhone: string;
  let otherRawPhone: string;
  let otherPhone: string;

  test.beforeEach(() => {
    sellerRawPhone = randomTestPhone("015");
    sellerPhone = normalizeEgyptianPhone(sellerRawPhone) as string;
    otherRawPhone = randomTestPhone("011");
    otherPhone = normalizeEgyptianPhone(otherRawPhone) as string;
  });

  test.afterEach(async () => {
    const [seller, other] = await Promise.all([
      prisma.user.findUnique({ where: { phone: sellerPhone } }).catch(() => null),
      prisma.user.findUnique({ where: { phone: otherPhone } }).catch(() => null),
    ]);
    if (seller) {
      await prisma.listing.deleteMany({ where: { ownerId: seller.id } });
      await prisma.session.deleteMany({ where: { userId: seller.id } });
      await prisma.user.delete({ where: { id: seller.id } });
    }
    if (other) {
      await prisma.session.deleteMany({ where: { userId: other.id } });
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  test("a seller can edit their listing's title/price via /listings/[id]/edit, and a non-owner is redirected away", async ({
    page,
  }) => {
    const title = uniqueTitle();
    const updatedTitle = `${title} - معدّل`;

    // --- seller signs up and creates a listing ---
    await loginViaOtp(page, sellerRawPhone);
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("السعر (ج.م)").fill("1000");
    await page.getByLabel("نوع المنتج").fill("سماعة");

    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    expect(created.success).toBe(true);
    const listingId = created.listingId as string;

    // --- the "تعديل الإعلان" link is present on the detail page ---
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByRole("button", { name: "تعديل الإعلان" })).toBeVisible();

    // --- navigating to the edit page opens the pre-filled form ---
    await page.goto(`/listings/${listingId}/edit`);

    // --- the form is pre-filled with the listing's current values ---
    await expect(page.getByLabel("العنوان")).toHaveValue(title);
    await expect(page.getByLabel("السعر (ج.م)")).toHaveValue("1000");

    // --- editing and saving updates the listing ---
    await page.getByLabel("العنوان").fill(updatedTitle);
    await page.getByLabel("السعر (ج.م)").fill("1500");
    const saveResponse = page.waitForResponse(
      (res) => res.url().includes(`/api/listings/${listingId}`) && res.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "حفظ التعديلات" }).click();
    await saveResponse;
    await page.waitForURL(`**/listings/${listingId}`);

    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await expect(page.getByText(/1.?500/)).toBeVisible();

    await logout(page);

    // --- a non-owner visiting the edit page directly is redirected away, never shown the form ---
    await loginViaOtp(page, otherRawPhone);
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForURL(`**/listings/${listingId}`);
    await expect(page.getByLabel("العنوان")).toHaveCount(0);
  });
});
