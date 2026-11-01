import { test, expect } from '@playwright/test';
import { registerViaUI } from './helpers';

test('employment dates support two employers and invalidate review when edited', async ({ page }) => {
  await registerViaUI(page, 'Two Employers Tester');
  await page.goto('/dashboard/tax');
  await page.getByRole('button', { name: 'Add employer / payslip' }).click();
  for (const [id, name, start, end] of [[1, 'First employer', '2025-01-01', '2025-06-30'], [2, 'Second employer', '2025-06-01', '2025-12-31']] as const) {
    await page.locator(`#employer-${id}`).fill(name);
    await page.locator(`#employment-start-${id}`).fill(start);
    await page.locator(`#employment-end-${id}`).fill(end);
    await page.locator(`#chargeable-${id}`).fill('500000');
    await page.locator(`#paye-${id}`).fill('100000');
    await page.locator(`#insurance-${id}`).fill('0');
    await page.getByRole('article', { name: `Employment document ${id}` }).getByRole('checkbox').check();
  }
  await page.locator('#tax-scope-confirm').check();
  await page.getByRole('button', { name: 'Calculate worksheet' }).click();
  await expect(page.getByRole('heading', { name: 'Your 2025 worksheet' })).toBeVisible();
  await expect(page.getByText(/KSh\s+8,600.00/, { exact: true })).toBeVisible();
  await page.locator('#employment-end-1').fill('2025-05-31');
  await expect(page.getByRole('heading', { name: 'Your 2025 worksheet' })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Employment document 1' }).getByRole('checkbox')).not.toBeChecked();
});

function samplePdf(lines: string[]) {
  const stream = lines.map((line, index) => `BT /F1 12 Tf 40 ${760 - index * 22} Td (${line.replace(/[\\()]/g, '\\$&')}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function scannedPdf(jpeg: Buffer) {
  const stream = 'q 612 0 0 188 0 500 cm /Scan Do Q';
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1300 /Height 400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')])];
  const chunks = [Buffer.from('%PDF-1.4\n')]; const offsets = [0]; let size = chunks[0]!.length;
  objects.forEach((object, index) => { offsets.push(size); const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]); chunks.push(chunk); size += chunk.length; });
  chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
  return Buffer.concat(chunks);
}

test('P9 PDF stays local, requires review, calculates and exports a checked worksheet', async ({ page }) => {
  await registerViaUI(page, 'Tax Tester');
  await page.goto('/dashboard/tax');
  const outbound: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST') outbound.push(request.url()); });
  await page.locator('#file-1').setInputFiles({ name: 'example-p9.pdf', mimeType: 'application/pdf', buffer: samplePdf(['Tax year: 2025', 'Total chargeable pay (COL. K) KES 1,000,000.00', 'Total PAYE tax 200,000.00', 'Insurance relief 0.00']) });
  await expect(page.locator('#chargeable-1')).toHaveValue('1000000.00', { timeout: 30000 });
  await expect(page.locator('#paye-1')).toHaveValue('200000.00');
  await page.locator('#employer-1').fill('Example employer');
  await page.locator('#employment-start-1').fill('2025-01-01');
  await page.locator('#employment-end-1').fill('2025-12-31');
  await page.locator('#tax-scope-confirm').check();
  await page.getByRole('button', { name: 'Calculate worksheet' }).click();
  await expect(page.getByText(/Review every document/)).toBeVisible();
  await page.getByLabel(/I checked the employer/).check();
  await page.getByRole('button', { name: 'Calculate worksheet' }).click();
  await expect(page.getByRole('heading', { name: 'Your 2025 worksheet' })).toBeVisible();
  await expect(page.getByText(/KSh\s+8,600.00/, { exact: true })).toBeVisible();
  const download = page.getByRole('button', { name: 'Download reviewed worksheet' });
  await expect(download).toBeDisabled();
  await page.locator('#tax-complete').check();
  const file = page.waitForEvent('download');
  await download.click();
  const downloaded = await file;
  expect(downloaded.suggestedFilename()).toBe('MoneyPilot-2025-tax-worksheet.csv');
  const stream = await downloaded.createReadStream();
  let csv = '';
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain('"P9","2025 annual"');
  expect(csv).toContain('"2025-01-01","2025-12-31"');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('tax-workspace-desktop.png'), fullPage: true });
  expect(outbound).toEqual([]);
  await page.locator('#chargeable-1').fill('900000');
  await expect(page.getByRole('heading', { name: 'Your 2025 worksheet' })).toHaveCount(0);
  await expect(page.getByLabel(/I checked the employer/)).not.toBeChecked();
  await page.getByLabel(/I checked the employer/).check();
  await page.locator('#file-1').setInputFiles({ name: 'invalid-p9.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByRole('alert').filter({ hasText: 'could not be read completely' })).toBeVisible();
  await expect(page.getByLabel(/I checked the employer/)).not.toBeChecked();
  await page.locator('#file-1').setInputFiles({ name: 'mixed-years.pdf', mimeType: 'application/pdf', buffer: samplePdf(['Tax year: 2025', 'Tax year: 2024', 'Taxable pay: 1000000.00', 'PAYE: 200000.00', 'Insurance relief: 0.00']) });
  await expect(page.getByText(/appears to be for another tax year/)).toBeVisible();
  await page.getByLabel(/I checked the employer/).check();
  await page.getByRole('button', { name: 'Calculate worksheet' }).click();
  await expect(page.getByRole('heading', { name: 'Your 2025 worksheet' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear worksheet' }).click();
  await expect(page.getByText(/Worksheet cleared/)).toBeVisible();
  await expect(page.getByText('example-p9.pdf', { exact: false })).toHaveCount(0);
});

test('OCR reads an image using same-origin assets without uploading it', async ({ page }) => {
  test.setTimeout(120000);
  await registerViaUI(page, 'OCR Tester');
  await page.goto('/dashboard/tax');
  const requests: { method: string; url: string }[] = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1300; canvas.height = 400;
    const context = canvas.getContext('2d')!; context.fillStyle = 'white'; context.fillRect(0, 0, 1300, 400); context.fillStyle = 'black'; context.font = '32px Arial';
    ['Tax year: 2025', 'Taxable pay: 1000000.00', 'PAYE: 200000.00', 'Insurance relief: 0.00'].forEach((line, index) => context.fillText(line, 40, 65 + index * 70));
    return { png: canvas.toDataURL('image/png').split(',')[1]!, jpeg: canvas.toDataURL('image/jpeg').split(',')[1]! };
  });
  await page.route('**/document-tools/worker.min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.locator('#file-1').setInputFiles({ name: 'cancel-this.png', mimeType: 'image/png', buffer: Buffer.from(image.png, 'base64') });
  await page.getByRole('button', { name: 'Cancel reading', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Reading cancelled');
  await expect(page.locator('#file-1')).toBeEnabled();
  await page.unrouteAll({ behavior: 'wait' });
  await page.locator('#file-1').setInputFiles({ name: 'example-payslip.png', mimeType: 'image/png', buffer: Buffer.from(image.png, 'base64') });
  await expect(page.locator('#chargeable-1')).toHaveValue('1000000.00', { timeout: 90000 });
  await expect(page.locator('#paye-1')).toHaveValue('200000.00');
  await page.locator('#file-1').setInputFiles({ name: 'scanned-p9.pdf', mimeType: 'application/pdf', buffer: scannedPdf(Buffer.from(image.jpeg, 'base64')) });
  await expect(page.getByText('Source text · scanned-p9.pdf')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#chargeable-1')).toHaveValue('1000000.00');
  await expect(page.locator('#paye-1')).toHaveValue('200000.00');
  expect(requests.some((request) => request.method === 'POST')).toBe(false);
  expect(requests.filter((request) => request.url.startsWith('http')).every((request) => new URL(request.url).origin === 'http://localhost:3105')).toBe(true);
});
