import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `010${suffix}`;
}

test.describe("phone OTP signup golden path", () => {
  let rawPhone: string;
  let normalizedPhone: string;

  test.beforeEach(() => {
    rawPhone = randomTestPhone();
    normalizedPhone = normalizeEgyptianPhone(rawPhone) as string;
  });

  test.afterEach(async () => {
    await prisma.session.deleteMany({ where: { user: { is: { phone: normalizedPhone } } } });
    await prisma.verificationRequest.deleteMany({
      where: { user: { is: { phone: normalizedPhone } } },
    });
    await prisma.otpCode.deleteMany({ where: { phone: normalizedPhone } });
    await prisma.user.deleteMany({ where: { phone: normalizedPhone } });
  });

  test("signs up with phone OTP, edits profile, requests verification, and logs out", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("رقم الهاتف").fill(rawPhone);

    const requestResponse = page.waitForResponse("**/api/auth/otp/request");
    await page.getByRole("button", { name: "إرسال الرمز" }).click();
    const requestJson = await (await requestResponse).json();
    expect(requestJson.ok).toBe(true);
    const devCode = requestJson.devCode as string;
    expect(devCode).toMatch(/^\d{6}$/);

    await page.getByLabel("رمز التحقق").fill(devCode);
    await page.getByRole("button", { name: "تأكيد" }).click();

    await page.waitForURL("**/profile");
    await expect(page.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();

    await page.getByLabel("الاسم").fill("مستخدم تجريبي");
    await page.getByLabel("البريد الإلكتروني (اختياري)").fill("test@example.com");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم الحفظ بنجاح")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("البريد الإلكتروني (اختياري)")).toHaveValue("test@example.com");

    await page.getByRole("button", { name: "إرسال طلب التوثيق" }).click();
    await expect(page.getByText("قيد المراجعة")).toBeVisible();

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await page.waitForURL("http://localhost:3000/");

    await page.goto("/profile");
    await page.waitForURL("**/login");
  });
});
