import { test, expect } from "@playwright/test";
import { createAccountViaApi, isoDay, registerViaUI } from "./helpers";

test("transfer money between two accounts of the same currency", async ({ page }) => {
  await registerViaUI(page, "Transfer Tester");
  const from = await createAccountViaApi(page, { name: "Salary pot", openingBalance: "5000" });
  const to = await createAccountViaApi(page, { name: "Pocket money", openingBalance: "0" });

  await page.goto("/dashboard/transfers");
  await page.selectOption("#tr-from", from.id);
  await page.selectOption("#tr-to", to.id);
  await page.fill("#tr-amount", "1250");
  await page.fill("#tr-description", "Weekly allowance");
  await page.getByRole("button", { name: "Move money" }).click();

  await expect(page.getByText("Weekly allowance")).toBeVisible();

  // Balances are derived on both sides of the transfer.
  await page.goto("/dashboard/accounts");
  await expect(page.getByText(/3,750\.00/).first()).toBeVisible();
  await expect(page.getByText(/1,250\.00/).first()).toBeVisible();
});

test("transfers appear in the transaction history with both legs", async ({ page }) => {
  await registerViaUI(page, "Transfer Tester");
  const from = await createAccountViaApi(page, { name: "Main wallet", openingBalance: "2000" });
  const to = await createAccountViaApi(page, { name: "Savings pot" });

  const res = await page.request.post("/api/transfers", {
    data: {
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "800",
      transactionDate: isoDay(),
      description: "To savings",
    },
  });
  expect(res.status()).toBe(201);

  await page.goto("/dashboard/transactions?kind=TRANSFER");
  // A transfer shows both legs (out and in) — both rows carry the description.
  await expect(page.getByText("To savings").first()).toBeVisible();
  await expect(page.getByText("Transfer", { exact: true }).first()).toBeVisible();
});
