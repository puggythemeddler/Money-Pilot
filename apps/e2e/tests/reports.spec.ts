import { test, expect } from '@playwright/test';
import { createAccountViaApi, registerViaUI } from './helpers';
import type { FinanceReport } from '@moneypilot/shared';

test('reports separate currencies, periods, deleted entries, transfers and other users', async ({ page, browser }) => {
  await registerViaUI(page, 'Report Tester');
  const kes = await createAccountViaApi(page, { name: 'Reports KES', openingBalance: '5000' });
  const other = await createAccountViaApi(page, { name: 'Other KES' });
  const usd = await createAccountViaApi(page, { name: 'Reports USD', currency: 'USD' });
  expect((await page.request.post('/api/household', { data: { name: 'Report household' } })).status()).toBe(201);
  const sharedResponse = await page.request.post('/api/household/accounts', { data: { name: 'Joint wallet', type: 'MPESA', currency: 'KES' } });
  expect(sharedResponse.status()).toBe(201);
  const sharedId = (await sharedResponse.json()).data.account.id;
  const categoryResponse = await page.request.post('/api/categories', { data: { name: 'Report groceries', kind: 'EXPENSE', color: '#0f766e' } });
  expect(categoryResponse.status()).toBe(201);
  const categoryId = (await categoryResponse.json()).data.category.id;
  const debtResponse = await page.request.post('/api/debts', { data: { name: 'Report loan', principal: '1000', currency: 'KES' } });
  expect(debtResponse.status()).toBe(201);
  const debtId = (await debtResponse.json()).data.debt.id;
  for (const entry of [
    { kind: 'INCOME', amount: '300', transactionDate: '2026-01-01' },
    { kind: 'EXPENSE', amount: '75', transactionDate: '2026-01-31', categoryId },
    { kind: 'EXPENSE', amount: '25', transactionDate: '2026-01-15', debtId },
    { kind: 'EXPENSE', amount: '900', transactionDate: '2026-02-01' },
    { kind: 'INCOME', amount: '80', transactionDate: '2025-12-31' },
    { kind: 'EXPENSE', amount: '999', transactionDate: '2026-01-15', accountId: usd.id },
    { kind: 'EXPENSE', amount: '888', transactionDate: '2026-01-15', accountId: sharedId },
  ]) {
    const response = await page.request.post('/api/transactions', { data: { accountId: kes.id, ...entry } });
    expect(response.status()).toBe(201);
  }
  const deleted = await page.request.post('/api/transactions', { data: { kind: 'EXPENSE', accountId: kes.id, amount: '200', transactionDate: '2026-01-15' } });
  const deletedId = (await deleted.json()).data.transaction.id;
  expect((await page.request.delete(`/api/transactions/${deletedId}`)).ok()).toBe(true);
  expect((await page.request.post('/api/transfers', { data: { fromAccountId: kes.id, toAccountId: other.id, amount: '500', transactionDate: '2026-01-15' } })).status()).toBe(201);
  const response = await page.request.get('/api/reports?month=2026-01&currency=KES');
  expect(response.ok()).toBe(true);
  const report: FinanceReport = (await response.json()).data;
  expect(report.totals).toEqual({ incomeMinor: 30000, expenseMinor: 10000, netMinor: 20000 });
  expect(report.trend).toHaveLength(6);
  expect(report.trend.find((row) => row.month === '2025-12')?.incomeMinor).toBe(8000);
  expect(report.categories.map((row) => [row.name, row.amountMinor])).toEqual([['Report groceries', 7500], ['Uncategorized', 2500]]);
  expect(report.debts[0]).toMatchObject({ name: 'Report loan', paidMinor: 2500, balanceMinor: 97500 });
  const february = (await (await page.request.get('/api/reports?month=2026-02&currency=KES')).json()).data;
  expect(february.totals).toEqual({ incomeMinor: 0, expenseMinor: 90000, netMinor: -90000 });
  expect(february.debts[0].paidMinor).toBe(2500);
  const dollars = (await (await page.request.get('/api/reports?month=2026-01&currency=USD')).json()).data;
  expect(dollars.totals.expenseMinor).toBe(99900);
  expect((await page.request.get('/api/reports?month=2026-13')).status()).toBe(400);
  expect((await page.request.get('/api/reports?currency=INVALID')).status()).toBe(400);

  await page.goto('/dashboard/reports?month=2026-01&currency=KES');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByText('Report groceries', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Report loan repayment progress' })).toHaveAttribute('value', '2500');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('reports-mobile.png'), fullPage: true });
  await page.locator('#report-currency').selectOption('USD');
  await page.getByRole('button', { name: 'Update report' }).click();
  await expect(page).toHaveURL(/currency=USD/);
  await expect(page.getByText('No active debts tracked in USD.')).toBeVisible();

  const isolated = await browser.newContext({ baseURL: 'http://localhost:3105' });
  const stranger = await isolated.newPage();
  expect((await stranger.request.get('/api/reports')).status()).toBe(401);
  await registerViaUI(stranger, 'Separate Report Tester');
  const privateReport = (await (await stranger.request.get('/api/reports?month=2026-01&currency=KES')).json()).data;
  expect(privateReport.totals.expenseMinor).toBe(0);
  expect(privateReport.categories).toEqual([]);
  expect(privateReport.debts).toEqual([]);
  await isolated.close();
});
