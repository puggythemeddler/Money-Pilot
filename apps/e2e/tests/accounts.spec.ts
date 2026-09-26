import { test, expect } from "@playwright/test";
import { createAccountViaApi, registerViaUI } from "./helpers";

test("create, view, archive and unarchive an account from the UI", async ({ page }) => {
  await registerViaUI(page, "Accounts Tester");
  await page.goto("/dashboard/accounts");

  await page.fill("#acct-name", "M-Pesa Wallet");
  await page.selectOption("#acct-type", "MPESA");
  await page.selectOption("#acct-currency", "KES");
  await page.fill("#acct-opening", "1500");
  await page.getByRole("button", { name: "Add account" }).click();

  // The new account is visible with its opening balance.
  await expect(page.getByText("M-Pesa Wallet")).toBeVisible();
  await expect(page.getByText(/1,500\.00/).first()).toBeVisible();
  // Wait for the form reset before archiving (buttons re-enable with it).
  await expect(page.locator("#acct-name")).toHaveValue("");

  // Archiving marks the row but keeps the history; unarchive restores it.
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Unarchive" }).click();
  await expect(page.getByText("Archived", { exact: true })).toHaveCount(0);
  await expect(page.getByText("M-Pesa Wallet")).toBeVisible();
});

test("accounts support multiple African currencies", async ({ page }) => {
  await registerViaUI(page, "Accounts Tester");
  await page.goto("/dashboard/accounts");

  for (const [name, code, opening, amount] of [
    ["Naira savings", "NGN", "25000", /25,000\.00/],
    ["Cedi wallet", "GHS", "400.55", /400\.55/],
  ] as const) {
    await page.fill("#acct-name", name);
    await page.selectOption("#acct-type", "SAVINGS");
    await page.selectOption("#acct-currency", code);
    await page.fill("#acct-opening", opening);
    await page.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(amount).first()).toBeVisible();
    // Wait for the form reset so the next fill is not wiped by it.
    await expect(page.locator("#acct-name")).toHaveValue("");
  }
});

test("editing an account through the API is reflected in the UI", async ({ page }) => {
  await registerViaUI(page, "Accounts Tester");
  const account = await createAccountViaApi(page, { name: "Old wallet name", openingBalance: "200" });

  const res = await page.request.patch(`/api/accounts/${account.id}`, { data: { name: "Renamed wallet" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).data.account.name).toBe("Renamed wallet");

  await page.goto("/dashboard/accounts");
  await expect(page.getByText("Renamed wallet")).toBeVisible();
  await expect(page.getByText("Old wallet name")).toHaveCount(0);
});
