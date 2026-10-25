import { test, expect } from "@playwright/test";
import { createAccountViaApi, registerViaUI, isoDay } from "./helpers";

test("repayments belong to one debt, including manually allocated historic expenses", async ({ page }) => {
  await registerViaUI(page, "Repayment review");
  const account = await createAccountViaApi(page, { name: "Payment wallet" });
  const category = (await (await page.request.post("/api/categories", { data: { name: "Repayments", kind: "EXPENSE" } })).json()).data.category;
  const debts: { id: string }[] = [];
  for (const name of ["Loan A", "Loan B"]) {
    const res = await page.request.post("/api/debts", { data: { name, principal: "1000", categoryId: category.id } });
    expect(res.status()).toBe(201);
    debts.push((await res.json()).data.debt);
  }
  const unallocated = await page.request.post("/api/transactions", { data: { kind: "EXPENSE", accountId: account.id, categoryId: category.id, amount: "200", transactionDate: isoDay() } });
  expect(unallocated.status()).toBe(201);
  const oldId = (await unallocated.json()).data.transaction.id;
  let rows = (await (await page.request.get("/api/debts")).json()).data.debts;
  expect(rows.map((d: { paidMinor: number }) => d.paidMinor)).toEqual([0, 0]);
  const paid = await page.request.post("/api/transactions", { data: { kind: "EXPENSE", accountId: account.id, categoryId: category.id, debtId: debts[0].id, amount: "1000", transactionDate: isoDay() } });
  expect(paid.status()).toBe(201);
  rows = (await (await page.request.get("/api/debts")).json()).data.debts;
  expect(rows.find((d: { id: string }) => d.id === debts[0].id).paidMinor).toBe(100000);
  expect(rows.find((d: { id: string }) => d.id === debts[1].id).paidMinor).toBe(0);
  const summary = (await (await page.request.get("/api/dashboard")).json()).data;
  expect(summary.debt.count).toBe(1);
  expect(summary.debt.totalMinor).toBe(100000);
  const allocation = await page.request.patch(`/api/transactions/${oldId}`, { data: { debtId: debts[1].id } });
  expect(allocation.ok()).toBeTruthy();
  rows = (await (await page.request.get("/api/debts")).json()).data.debts;
  expect(rows.find((d: { id: string }) => d.id === debts[1].id).paidMinor).toBe(20000);
  const deleted = await page.request.delete(`/api/transactions/${oldId}`);
  expect(deleted.ok()).toBeTruthy();
  rows = (await (await page.request.get("/api/debts")).json()).data.debts;
  expect(rows.find((d: { id: string }) => d.id === debts[1].id).paidMinor).toBe(0);
  // A second user cannot attach their expense to somebody else's creditor.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await registerViaUI(page, "Other person");
  const other = await createAccountViaApi(page, { name: "Other wallet" });
  const forbidden = await page.request.post("/api/transactions", { data: { kind: "EXPENSE", accountId: other.id, debtId: debts[0].id, amount: "1", transactionDate: isoDay() } });
  expect(forbidden.status()).toBe(404);
});

test("month totals and bounded transaction searches exclude previous and next months", async ({ page }) => {
  await registerViaUI(page, "Date review");
  const account = await createAccountViaApi(page, { name: "Dates wallet" });
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  for (const [date, amount] of [[new Date(start.getTime() - 86400000), "100"], [start, "20"], [next, "300"]] as const) {
    const res = await page.request.post("/api/transactions", { data: { kind: "EXPENSE", accountId: account.id, amount, transactionDate: date.toISOString().slice(0, 10) } });
    expect(res.status()).toBe(201);
  }
  const summary = (await (await page.request.get("/api/dashboard")).json()).data;
  expect(summary.month.expenseMinor).toBe(2000);
  expect(summary.allTime.expenseMinor).toBe(42000);
  const from = start.toISOString().slice(0, 10);
  const to = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
  const filtered = (await (await page.request.get(`/api/transactions?from=${from}&to=${to}`)).json()).data;
  expect(filtered.items).toHaveLength(1);
});

test("phone navigation fits and exposes every page and account controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerViaUI(page, "Mobile review");
  const nav = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  const box = await nav.boundingBox();
  for (const link of await nav.getByRole("link").all()) {
    const bounds = await link.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(box!.x + box!.width);
  }
  await nav.getByRole("button", { name: "More", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "All pages" });
  for (const name of ["Bills", "Income", "Household", "Categories", "Settings", "Budgets"]) {
    await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
