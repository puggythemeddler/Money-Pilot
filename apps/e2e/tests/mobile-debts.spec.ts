import { test, expect } from "@playwright/test";
import { createAccountViaApi, registerViaUI } from "./helpers";

test("debt actions and payment forms stay usable on narrow screens", async ({ page }) => {
  await registerViaUI(page, "Mobile Tester");
  const account = await createAccountViaApi(page, { name: "Main wallet", openingBalance: "50000" });
  const transaction = await page.request.post("/api/transactions", {
    data: { kind: "EXPENSE", accountId: account.id, amount: "150", description: "Matatu fare for the evening journey", transactionDate: "2026-11-01" },
  });
  expect(transaction.status()).toBe(201);
  const response = await page.request.post("/api/debts", {
    data: { name: "Long household renovation and school fees loan", institution: "Community savings cooperative", principal: "1250000", currency: "KES" },
  });
  expect(response.status()).toBe(201);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/debts");
    await expect(page.getByRole("button", { name: "Pay", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: test.info().outputPath("mobile-debts.png"), fullPage: true });
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.locator("#dt-pay-amount")).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#dt-pay-date')).toBeFocused();
  expect(await page.locator('#dt-pay-date').evaluate((field) => field.getBoundingClientRect().bottom <= document.querySelector('nav[aria-label="Mobile navigation"]')!.getBoundingClientRect().top)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("#dt-edit-name")).toBeFocused();
  await expect(page.locator("#dt-pay-amount")).toHaveCount(0);
  await page.locator("#dt-edit-institution").fill("Updated cooperative");
  await expect(page.locator("#dt-edit-institution")).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("navigation", { name: "All mobile pages" }).getByRole("link", { name: "Bills", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/bills$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/dashboard/transactions");
  const description = page.getByText("Matatu fare for the evening journey", { exact: true });
  await expect(description).toBeVisible();
  expect(await description.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/dashboard");
  await page.screenshot({ path: test.info().outputPath("mobile-dashboard.png"), fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll("main *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth)
    .map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })));
  expect(overflow).toEqual([]);
});
