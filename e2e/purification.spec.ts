import { test, expect } from "@playwright/test";

test.describe("Purification", () => {
  test.beforeEach(async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-me-on-first-login";

    await page.goto("/login");
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/overview/);
  });

  test("summary cards show purification amounts", async ({ page }) => {
    const gainsCard = page.locator("text=Total gains to purify");
    await expect(gainsCard).toBeVisible();
  });
});
