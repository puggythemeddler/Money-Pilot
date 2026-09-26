import { expect, type Page } from "@playwright/test";

export const E2E_PASSWORD = "Sup3r-Secure!";

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export async function registerViaUI(page: Page, name = "E2E Tester"): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/register");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", E2E_PASSWORD);
  await page.selectOption("#currency", "KES");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  return email;
}

export async function loginViaUI(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

export async function logoutViaUI(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
}

export interface ApiAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
}

export async function createAccountViaApi(
  page: Page,
  input: { name: string; type?: string; currency?: string; openingBalance?: string },
): Promise<ApiAccount> {
  const res = await page.request.post("/api/accounts", {
    data: {
      name: input.name,
      type: input.type ?? "BANK",
      currency: input.currency ?? "KES",
      ...(input.openingBalance !== undefined ? { openingBalance: input.openingBalance } : {}),
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.data.account;
}

/** Local ISO date (yyyy-mm-dd) so seeded records always land in the current month. */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
