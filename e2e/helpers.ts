import { expect, type Page } from "@playwright/test";

/** Log into the app via the /login form. */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/overview");
  await expect(page.getByText("Holdings", { exact: false })).toBeVisible();
}

/** Navigate to a company page. Returns the company name from the URL. */
export async function goToCompany(
  page: Page,
  companyId: string,
): Promise<void> {
  await page.goto(`/companies/${companyId}`);
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toBeVisible({ timeout: 10_000 });
}
