import { test, expect } from "@playwright/test";

// SiteHeader had zero responsive behavior before Phase 9 — every link and
// button was always rendered, regardless of viewport. This verifies the
// fix actually works end-to-end rather than just trusting the Tailwind
// classes: the desktop nav is hidden below md, the hamburger is visible,
// and opening it reveals a working, navigable menu.
test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("collapses the header nav into a hamburger menu on a narrow viewport", async ({ page }) => {
    await page.goto("/");

    // The desktop nav link exists in the DOM (unconditionally rendered)
    // but must be hidden via the md:flex breakpoint at this width.
    await expect(page.getByRole("link", { name: "تصفح الإعلانات" })).toBeHidden();

    const menuButton = page.getByRole("button", { name: "القائمة" });
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    const mobileNav = page.getByRole("navigation", { name: "روابط الموقع" });
    const browseLink = mobileNav.getByRole("link", { name: "تصفح الإعلانات" });
    await expect(browseLink).toBeVisible();

    await browseLink.click();
    await page.waitForURL("**/search");
  });
});
