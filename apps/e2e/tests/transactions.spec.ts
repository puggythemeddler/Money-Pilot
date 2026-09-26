import { test, expect } from "@playwright/test";
import { createAccountViaApi, isoDay, registerViaUI } from "./helpers";

test("record income and expenses, then browse and filter the history", async ({ page }) => {
  await registerViaUI(page, "Tx Tester");
  const account = await createAccountViaApi(page, { name: "KCB Current" });
  await page.goto("/dashboard/transactions");

  // Income first.
  await page.selectOption("#tx-kind", "INCOME");
  await page.selectOption("#tx-account", account.id);
  await page.fill("#tx-amount", "20000");
  await page.fill("#tx-description", "Freelance payment");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByText("Freelance payment")).toBeVisible();
  // The form resets only after the refresh settles — wait for it so the
  // next fill is not wiped by the reset.
  await expect(page.locator("#tx-amount")).toHaveValue("");
  await expect(page.locator("#tx-description")).toHaveValue("");

  // Then an expense. The form reset above also clears the account select,
  // so it is re-selected here.
  await page.selectOption("#tx-kind", "EXPENSE");
  await page.selectOption("#tx-account", account.id);
  await page.fill("#tx-amount", "450.5");
  await page.fill("#tx-description", "Market run");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByText("Market run")).toBeVisible();
  await expect(page.locator("#tx-amount")).toHaveValue("");

  // The history header counts both entries.
  await expect(page.getByText("2 transactions")).toBeVisible();

  // Filtering by kind narrows the list and updates the URL. The header count
  // reflects the filtered render, so waiting on it also proves the navigation
  // settled before the next filter change (the selects are server-controlled
  // and merges use the last rendered state).
  await page.selectOption("#f-kind", "INCOME");
  await expect(page).toHaveURL(/kind=INCOME/);
  await expect(page.getByText("Freelance payment")).toBeVisible();
  await expect(page.getByText("Market run")).toHaveCount(0);
  await expect(page.getByText("1 transaction", { exact: true })).toBeVisible();

  // Searching by description narrows it too — but only after the unfiltered
  // render has settled, otherwise the search merge would keep kind=INCOME.
  await page.selectOption("#f-kind", "");
  await expect(page.getByText("2 transactions")).toBeVisible();
  await page.fill("#f-q", "Market");
  await expect(page).toHaveURL(/q=Market/);
  await expect(page.getByText("1 transaction", { exact: true })).toBeVisible();
  await expect(page.getByText("Market run")).toBeVisible();
  await expect(page.getByText("Freelance payment")).toHaveCount(0);
});

test("recording an expense in a foreign currency keeps its own units", async ({ page }) => {
  await registerViaUI(page, "Tx Tester");
  const account = await createAccountViaApi(page, { name: "Dollar card", currency: "USD" });
  await page.goto("/dashboard/transactions");

  await page.selectOption("#tx-kind", "EXPENSE");
  await page.selectOption("#tx-account", account.id);
  await page.fill("#tx-amount", "12.99");
  await page.fill("#tx-description", "Streaming subscription");
  await page.getByRole("button", { name: "Save transaction" }).click();

  await expect(page.getByText("Streaming subscription")).toBeVisible();
  // formatMoney renders "USD 12.99" with the symbol substituted: "$ 12.99".
  await expect(page.getByText(/\$\s*12\.99/)).toBeVisible();
});

test("the transaction API paginates history", async ({ page }) => {
  await registerViaUI(page, "Tx Tester");
  const account = await createAccountViaApi(page, { name: "Pagination account" });

  for (let i = 1; i <= 5; i++) {
    const res = await page.request.post("/api/transactions", {
      data: {
        kind: "INCOME",
        accountId: account.id,
        amount: String(i * 100),
        transactionDate: isoDay(-1),
        description: `Bulk item ${i}`,
      },
    });
    expect(res.status()).toBe(201);
  }

  const first = await (await page.request.get("/api/transactions?limit=2&offset=0")).json();
  expect(first.data.items).toHaveLength(2);
  expect(first.data.pagination.total).toBe(5);
  expect(first.data.pagination.limit).toBe(2);
  expect(first.data.pagination.offset).toBe(0);

  const last = await (await page.request.get("/api/transactions?limit=2&offset=4")).json();
  expect(last.data.items).toHaveLength(1);

  const pastEnd = await (await page.request.get("/api/transactions?limit=2&offset=6")).json();
  expect(pastEnd.data.items).toHaveLength(0);
  expect(pastEnd.data.pagination.total).toBe(5);
});
