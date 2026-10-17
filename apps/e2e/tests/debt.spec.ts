import { test, expect } from "@playwright/test";
import { createAccountViaApi, registerViaUI } from "./helpers";

test("paying a debt records a real payment to the named creditor", async ({ page }) => {
  await registerViaUI(page, "Debt Tester");
  const account = await createAccountViaApi(page, { name: "KCB Current", openingBalance: "50000" });

  const cat = await (
    await page.request.post("/api/categories", {
      data: { name: "Loan payments", kind: "EXPENSE", color: "#0f766e" },
    })
  ).json();
  const categoryId = cat.data.category.id;

  const debtRes = await page.request.post("/api/debts", {
    data: {
      name: "Car loan",
      institution: "KCB",
      principal: "250000",
      currency: "KES",
      categoryId,
    },
  });
  expect(debtRes.status()).toBe(201);
  const debt = (await debtRes.json()).data.debt;

  await page.goto("/dashboard/debts");
  await expect(page.getByText("Car loan")).toBeVisible();

  // Open the pay panel: it names the debt and who the payment goes to.
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByText("Pay Car loan")).toBeVisible();
  await expect(page.getByText("Payment goes to")).toBeVisible();
  await expect(page.getByText("KCB", { exact: true })).toBeVisible();

  // The amount is prefilled with the remaining balance; pick the account and pay.
  await page.selectOption("#dt-pay-account", account.id);
  await page.getByRole("button", { name: "Record payment" }).click();

  // The balance drops to zero and the payment is counted against the debt.
  await expect(page.getByText(/paid\s+KSh\s+250,000\.00\s+of\s+KSh\s+250,000\.00/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay", exact: true })).toHaveCount(0);

  // The payment is a real EXPENSE whose merchant is the creditor.
  const tx = await (await page.request.get("/api/transactions?kind=EXPENSE")).json();
  expect(tx.data.items).toHaveLength(1);
  expect(tx.data.items[0].merchant).toBe("KCB");
  expect(tx.data.items[0].description).toMatch(/Payment to KCB/);
  expect(tx.data.items[0].amountMinor).toBe(-25000000);
  expect(tx.data.items[0].accountId).toBe(account.id);

  // The account balance reflects the money actually leaving.
  const accounts = await (await page.request.get("/api/accounts")).json();
  const kcb = accounts.data.accounts.find((a: { id: string }) => a.id === account.id);
  // 50,000 opening − 250,000 payment = −200,000 (the account may go overdrawn).
  expect(kcb.balanceMinor).toBe(-20000000);

  // The debt itself is fully settled on the API too.
  const debts = await (await page.request.get("/api/debts")).json();
  const settled = debts.data.debts.find((d: { id: string }) => d.id === debt.id);
  expect(settled.paidMinor).toBe(25000000);
  expect(settled.balanceMinor).toBe(0);
});

test("paying a debt rejects an account in the wrong currency", async ({ page }) => {
  await registerViaUI(page, "Debt Tester");
  await createAccountViaApi(page, { name: "KES only wallet", currency: "KES" });

  const debtRes = await page.request.post("/api/debts", {
    data: { name: "Dollar card balance", institution: "Chase", principal: "500", currency: "USD" },
  });
  expect(debtRes.status()).toBe(201);

  await page.goto("/dashboard/debts");
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  // Only a KES account exists, so the prefilled account is the wrong currency.
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/This debt is in USD but KES only wallet is in KES/)).toBeVisible();

  // Nothing was recorded.
  const tx = await (await page.request.get("/api/transactions?kind=EXPENSE")).json();
  expect(tx.data.items).toHaveLength(0);
});

test("the overview surfaces total debt and the income card", async ({ page }) => {
  await registerViaUI(page, "Debt Tester");
  await createAccountViaApi(page, { name: "Main wallet", openingBalance: "10000" });

  const debtRes = await page.request.post("/api/debts", {
    data: { name: "School fees loan", institution: "Equity", principal: "40000", currency: "KES" },
  });
  expect(debtRes.status()).toBe(201);

  await page.goto("/dashboard");

  // The total-debt card names the creditor and the outstanding amount.
  await expect(page.getByText("Total debt")).toBeVisible();
  await expect(page.getByText(/40,000\.00/).first()).toBeVisible();
  await expect(page.getByText("School fees loan")).toBeVisible();
  await expect(page.getByText(/Equity/).first()).toBeVisible();

  // The income card shows the empty state until a recurring income exists.
  await expect(page.getByText("Income this period")).toBeVisible();
  await expect(page.getByText("No recurring income tracked yet.")).toBeVisible();
});
