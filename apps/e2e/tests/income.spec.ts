import { test, expect } from "@playwright/test";
import { createAccountViaApi, registerViaUI } from "./helpers";

test("recording a salary month creates a real deposit and blocks a double record", async ({ page }) => {
  await registerViaUI(page, "Salary Tester");
  const account = await createAccountViaApi(page, { name: "Payroll account", openingBalance: "0" });

  const cat = await (
    await page.request.post("/api/categories", {
      data: { name: "Salary", kind: "INCOME", color: "#059669" },
    })
  ).json();
  const categoryId = cat.data.category.id;

  const incomeRes = await page.request.post("/api/recurring-income", {
    data: {
      name: "Monthly salary",
      payee: "Acme Ltd",
      amount: "85000",
      currency: "KES",
      payDay: 28,
      categoryId,
    },
  });
  expect(incomeRes.status()).toBe(201);
  const income = (await incomeRes.json()).data.income;

  await page.goto("/dashboard/income");
  await expect(page.getByText("Monthly salary")).toBeVisible();
  await expect(page.getByText("Acme Ltd").first()).toBeVisible();

  // Open the record panel: it names the income and who pays it.
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByText("Record Monthly salary from Acme Ltd")).toBeVisible();

  // The account is prefilled; record the month.
  await page.selectOption("#ri-record-account", account.id);
  await page.getByRole("button", { name: "Record income" }).click();

  // The income shows as received and the Record button disappears.
  await expect(page.getByText(/received for /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);

  // The money genuinely landed in the account.
  const accounts = await (await page.request.get("/api/accounts")).json();
  const payroll = accounts.data.accounts.find((a: { id: string }) => a.id === account.id);
  expect(payroll.balanceMinor).toBe(8500000);

  // Recording the same month again via the API is rejected as a conflict.
  const again = await page.request.post(`/api/recurring-income/${income.id}`, {
    data: { accountId: account.id },
  });
  expect(again.status()).toBe(409);

  // The transaction is a real INCOME entry credited to the payer.
  const tx = await (await page.request.get("/api/transactions?kind=INCOME")).json();
  expect(tx.data.items).toHaveLength(1);
  expect(tx.data.items[0].merchant).toBe("Acme Ltd");
  expect(tx.data.items[0].description).toMatch(/Income: Monthly salary/);
  expect(tx.data.items[0].amountMinor).toBe(8500000);
  expect(tx.data.items[0].categoryId).toBe(categoryId);
});

test("recording income rejects an account in the wrong currency", async ({ page }) => {
  await registerViaUI(page, "Salary Tester");
  await createAccountViaApi(page, { name: "KES only wallet", currency: "KES" });

  const incomeRes = await page.request.post("/api/recurring-income", {
    data: { name: "Dollar retainer", payee: "Globex", amount: "500", currency: "USD", payDay: 1 },
  });
  expect(incomeRes.status()).toBe(201);

  await page.goto("/dashboard/income");
  await page.getByRole("button", { name: "Record", exact: true }).click();

  // Only a KES account exists, so the prefilled account is the wrong currency.
  await page.getByRole("button", { name: "Record income" }).click();
  await expect(page.getByText(/This income is in USD but KES only wallet is in KES/)).toBeVisible();

  // Nothing was recorded.
  const tx = await (await page.request.get("/api/transactions?kind=INCOME")).json();
  expect(tx.data.items).toHaveLength(0);
});

test("the overview income card reports expected vs received", async ({ page }) => {
  await registerViaUI(page, "Salary Tester");
  const account = await createAccountViaApi(page, { name: "Payroll account", openingBalance: "0" });

  await page.request.post("/api/recurring-income", {
    data: { name: "Monthly salary", payee: "Acme Ltd", amount: "85000", currency: "KES", payDay: 28 },
  });

  // Before recording: expected but nothing received yet.
  await page.goto("/dashboard");
  await expect(page.getByText("Income this period")).toBeVisible();
  await expect(page.getByText(/received\s+of\s+KSh\s+85,000\.00\s+expected\s+.\s+0\s+of\s+1\s+recorded/)).toBeVisible();

  // Record the month, then the card shows it received.
  await page.goto("/dashboard/income");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.selectOption("#ri-record-account", account.id);
  await page.getByRole("button", { name: "Record income" }).click();
  await expect(page.getByText(/received for /)).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(/received\s+of\s+KSh\s+85,000\.00\s+expected\s+.\s+1\s+of\s+1\s+recorded/)).toBeVisible();
});
