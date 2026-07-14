import { test, expect } from "@playwright/test";

test.describe("Admin", () => {
  test.beforeEach(async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-me-on-first-login";

    await page.goto("/login");
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/overview/);
  });

  test("admin companies page loads", async ({ page }) => {
    await page.goto("/admin/companies");
    await expect(page.locator("text=Company Management")).toBeVisible();
    await expect(page.locator("text=Approved Companies")).toBeVisible();
  });

  test("admin users page loads", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("text=User Management")).toBeVisible();
  });

  test("admin audit log page loads", async ({ page }) => {
    await page.goto("/admin/audit-log");
    await expect(page.locator("text=Audit Log")).toBeVisible();
  });

  test("admin settings page loads", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("admin reports page loads", async ({ page }) => {
    await page.goto("/admin/reports");
    await expect(page).not.toHaveURL(/\/login/);
  });
});
