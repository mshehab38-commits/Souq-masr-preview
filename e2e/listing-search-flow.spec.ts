import path from "node:path";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `011${suffix}`;
}

function uniqueTitle(): string {
  return `تلفزيون سامسونج ذكي اختبار ${Math.floor(Math.random() * 1_000_000)}`;
}

test.describe("post a listing with an image, then find it via search", () => {
  let rawPhone: string;
  let normalizedPhone: string;

  test.beforeEach(() => {
    rawPhone = randomTestPhone();
    normalizedPhone = normalizeEgyptianPhone(rawPhone) as string;
  });

  test.afterEach(async () => {
    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (user) {
      await prisma.listingImage.deleteMany({ where: { listing: { ownerId: user.id } } });
      await prisma.listing.deleteMany({ where: { ownerId: user.id } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  test("listing with an uploaded image is findable via search with a real thumbnail", async ({ page }) => {
    const title = uniqueTitle();

    // --- sign in ---
    await page.goto("/login");
    await page.getByLabel("رقم الهاتف").fill(rawPhone);
    const requestResponse = page.waitForResponse("**/api/auth/otp/request");
    await page.getByRole("button", { name: "إرسال الرمز" }).click();
    const devCode = (await (await requestResponse).json()).devCode as string;
    await page.getByLabel("رمز التحقق").fill(devCode);
    await page.getByRole("button", { name: "تأكيد" }).click();
    await page.waitForURL("**/profile");

    // --- create a listing ---
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("السعر (ج.م)").fill("3500");
    await page.getByLabel("نوع المنتج").fill("تلفزيون ذكي");

    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    expect(created.success).toBe(true);
    await page.waitForURL(`**/listings/${created.listingId}`);

    // --- upload an image ---
    const confirmResponse = page.waitForResponse("**/images/confirm");
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures/sample.jpg"));
    const confirmed = await (await confirmResponse).json();
    expect(confirmed.success).toBe(true);

    // --- poll search until the background worker has processed the image ---
    await expect(async () => {
      const response = await page.request.get(
        `/api/search?q=${encodeURIComponent("تلفزيون سامسونج")}`,
      );
      const body = await response.json();
      const match = body.items.find((item: { id: string }) => item.id === created.listingId);
      expect(match).toBeTruthy();
      expect(match.thumbnailUrl).toBeTruthy();
    }).toPass({ timeout: 15_000 });

    // --- confirm the search results page actually renders the thumbnail image ---
    await page.goto(`/search?q=${encodeURIComponent("تلفزيون سامسونج")}`);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.locator("img").first()).toBeVisible();
  });
});
