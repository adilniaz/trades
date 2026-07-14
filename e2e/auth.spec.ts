import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login with seeded admin credentials", async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-me-on-first-login";

    await page.goto("/login");
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');

    // Should redirect to overview
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator("text=Overview")).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.fill('input[name="password"]', "wrong-password-123");
    await page.click('button[type="submit"]');

    // Should stay on login page or show error
    await expect(page.locator("text=Invalid")).toBeVisible();
  });

  test("protected route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign out returns to login page", async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-me-on-first-login";

    await page.goto("/login");
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/overview/);

    // Click sign out
    await page.click("text=Sign out");
    await expect(page).toHaveURL(/\/login/);
  });
});
