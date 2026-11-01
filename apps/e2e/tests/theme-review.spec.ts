import { test, expect } from '@playwright/test';
import { createAccountViaApi, registerViaUI } from './helpers';

test('light and dark themes remain readable and fit desktop and mobile', async ({ page }) => {
  test.setTimeout(120000);
  await registerViaUI(page, 'Theme Reviewer');
  const account = await createAccountViaApi(page, { name: 'Everyday account', openingBalance: '50000' });
  expect((await page.request.post('/api/transactions', { data: { kind: 'INCOME', accountId: account.id, amount: '85000', transactionDate: '2025-11-01', description: 'Salary' } })).status()).toBe(201);
  expect((await page.request.post('/api/transactions', { data: { kind: 'EXPENSE', accountId: account.id, amount: '12500', transactionDate: '2025-11-02', description: 'Household shopping and transport' } })).status()).toBe(201);
  expect((await page.request.post('/api/debts', { data: { name: 'Household renovation loan', institution: 'Community cooperative', principal: '125000', currency: 'KES' } })).status()).toBe(201);
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard');
    if ((await page.locator('html').getAttribute('class') ?? '').includes('dark') !== (theme === 'dark')) {
      await page.getByRole('button', { name: 'Toggle dark mode' }).click();
    }
    for (const route of ['dashboard', 'dashboard/debts', 'dashboard/transactions', 'dashboard/reports?month=2025-11&currency=KES', 'dashboard/tax']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/' + route);
      expect((await page.locator('html').getAttribute('class') ?? '').includes('dark')).toBe(theme === 'dark');
      if (route === 'dashboard/tax') {
        await page.locator('#employer-1').fill('Example employer');
  await page.locator('#employment-start-1').fill('2025-01-01');
  await page.locator('#employment-end-1').fill('2025-12-31');
        await page.locator('#chargeable-1').fill('1000000');
        await page.locator('#paye-1').fill('200000');
        await page.locator('#insurance-1').fill('0');
        await page.locator('#tax-scope-confirm').check();
        await page.getByLabel(/I checked the employer/).check();
        await page.getByRole('button', { name: 'Calculate worksheet' }).click();
        await expect(page.getByRole('heading', { name: 'Your 2025 worksheet' })).toBeVisible();
      }
      const pageName = route.split('?')[0]!.replaceAll('/', '-');
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        // Verify the semantic small-text palette against actual surfaces in each theme.
        const contrast = await page.evaluate(() => {
          const css = getComputedStyle(document.documentElement);
          const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
          const context = canvas.getContext('2d')!;
          const lum = (color: string) => {
            context.fillStyle = color.trim(); context.fillRect(0, 0, 1, 1);
            const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
            return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
          };
          const ratios = [];
          for (const foreground of ['--body-text', '--muted', '--faint']) for (const background of ['--page', '--surface']) {
            const pair = [lum(css.getPropertyValue(foreground)), lum(css.getPropertyValue(background))].sort((a, b) => b - a);
            ratios.push((pair[0]! + 0.05) / (pair[1]! + 0.05));
          }
          return Math.min(...ratios);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: test.info().outputPath(`${theme}-${pageName}-${width}.png`), fullPage: true });
        if (route === 'dashboard/tax' && width === 1280) await page.screenshot({ path: test.info().outputPath(`${theme}-tax-preview.png`) });
      }
    }
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'All mobile pages' }).getByRole('link', { name: 'Tax preparation' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${theme}-mobile-menu.png`) });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
});
