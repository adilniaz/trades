import { test, expect } from "@playwright/test";

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-me-on-first-login";

    await page.goto("/login");
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/overview/);
  });

  test("overview page loads with summary cards", async ({ page }) => {
    await expect(page.locator("text=Total gains to purify")).toBeVisible();
    await expect(page.locator("text=Total dividends to purify")).toBeVisible();
  });
});
