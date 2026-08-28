import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/db";
import { normalizeEgyptianPhone } from "../src/modules/identity/phone";

function randomTestPhone(prefix: string): string {
  const suffix = Math.floor(10_000_000 + Math.random() * 89_999_999).toString();
  return `${prefix}${suffix}`;
}

function uniqueTitle(): string {
  return `سماعة بلوتوث اختبار الدفع ${Math.floor(Math.random() * 1_000_000)}`;
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

test.describe("checkout: zero-commission cash-on-delivery order", () => {
  let sellerRawPhone: string;
  let sellerPhone: string;
  let buyerRawPhone: string;
  let buyerPhone: string;

  test.beforeEach(() => {
    sellerRawPhone = randomTestPhone("010");
    sellerPhone = normalizeEgyptianPhone(sellerRawPhone) as string;
    buyerRawPhone = randomTestPhone("012");
    buyerPhone = normalizeEgyptianPhone(buyerRawPhone) as string;
  });

  test.afterEach(async () => {
    const seller = await prisma.user.findUnique({ where: { phone: sellerPhone } });
    const buyer = await prisma.user.findUnique({ where: { phone: buyerPhone } });
    if (seller) {
      await prisma.order.deleteMany({ where: { sellerId: seller.id } });
      await prisma.listing.deleteMany({ where: { ownerId: seller.id } });
      await prisma.session.deleteMany({ where: { userId: seller.id } });
      await prisma.user.delete({ where: { id: seller.id } });
    }
    if (buyer) {
      await prisma.order.deleteMany({ where: { buyerId: buyer.id } });
      await prisma.session.deleteMany({ where: { userId: buyer.id } });
      await prisma.user.delete({ where: { id: buyer.id } });
    }
  });

  test("a buyer can check out a commerce-enabled listing, and the seller receives the full price with zero platform commission", async ({
    page,
  }) => {
    const title = uniqueTitle();

    // --- seller signs up ---
    await loginViaOtp(page, sellerRawPhone);

    // Commerce eligibility requires the seller to be verified; there is no
    // self-serve instant-approval flow yet (approval is an admin action —
    // Phase 10), so this test grants it directly, the same shortcut used
    // when manually verifying this flow end-to-end during development.
    const seller = await prisma.user.findUniqueOrThrow({ where: { phone: sellerPhone } });
    await prisma.user.update({ where: { id: seller.id }, data: { commerceVerifiedAt: new Date() } });

    // --- seller creates a commerce-enabled listing ---
    await page.goto("/listings/new");
    await page.getByLabel("القسم").selectOption({ label: "إلكترونيات" });
    await page.getByLabel("العنوان").fill(title);
    await page.getByLabel("السعر (ج.م)").fill("350");
    await page.getByLabel("نوع المنتج").fill("سماعة");
    await page.getByLabel("تفعيل الشراء المباشر (دفع وشحن عبر المنصة)").check();

    const createResponse = page.waitForResponse("**/api/listings");
    await page.getByRole("button", { name: "نشر الإعلان" }).click();
    const created = await (await createResponse).json();
    expect(created.success).toBe(true);
    const listingId = created.listingId as string;

    await logout(page);

    // --- buyer signs up and checks out ---
    await loginViaOtp(page, buyerRawPhone);

    await page.goto(`/listings/${listingId}`);
    await page.getByRole("link", { name: "اشترِ الآن" }).click();
    await page.waitForURL(`**/listings/${listingId}/checkout`);

    await page.getByLabel("اسم المستلم").fill("مشتري الاختبار");
    await page.getByLabel("رقم الهاتف").fill("01000000000");

    const orderResponse = page.waitForResponse("**/api/orders");
    await page.getByRole("button", { name: "تأكيد الطلب" }).click();
    const orderData = await (await orderResponse).json();
    expect(orderData.success).toBe(true);
    await page.waitForURL(`**/orders/${orderData.orderId}`);

    // --- verify the order was created correctly: full price, no shipping fee, COD ---
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderData.orderId } });
    expect(Number(order.productPrice)).toBe(350);
    expect(order.shippingFee).toBeNull();
    expect(Number(order.totalAmount)).toBe(350);
    expect(order.paymentMethod).toBe("CASH_ON_DELIVERY");
    expect(order.status).toBe("PENDING");

    // --- the listing is reserved (SOLD) so it can't be bought twice ---
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe("SOLD");

    // --- the zero-commission guarantee: no ledger entry exists for this order at all ---
    const ledgerCount = await prisma.ledgerEntry.count({ where: { orderId: orderData.orderId } });
    expect(ledgerCount).toBe(0);
  });
});
