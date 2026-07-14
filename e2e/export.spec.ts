import { test, expect } from "@playwright/test";
import fs from "fs";

test.describe("Export", () => {
  test.beforeEach(async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-me-on-first-login";

    await page.goto("/login");
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/overview/);
  });

  test("settings page has export links", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("text=Export my transactions")).toBeVisible();
    await expect(page.locator("text=Export my holdings")).toBeVisible();
  });

  test("export transactions downloads CSV", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.goto("/api/export");
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename).toBe("transactions.csv");

    const path = await download.path();
    expect(path).toBeTruthy();
    const content = fs.readFileSync(path!, "utf-8");
    expect(content).toContain("Date");
    expect(content).toContain("Company");
    expect(content).toContain("Ticker");
  });

  test("export holdings downloads CSV", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.goto("/api/export/holdings");
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename).toBe("holdings.csv");

    const path = await download.path();
    expect(path).toBeTruthy();
    const content = fs.readFileSync(path!, "utf-8");
    expect(content).toContain("Company");
    expect(content).toContain("Shares Held");
  });
});
