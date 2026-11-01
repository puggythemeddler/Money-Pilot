# Kenya employment tax worksheet

The first release supports year of income 2025 only, for people resident in
Kenya throughout that year with ordinary employment income only. It prepares
a reference worksheet, not an iTax import or submitted return. Other income,
special exemptions, terminal benefits, foreign credits, interest and penalties
are outside scope. Do not reuse the rules for other years without review.

Rules are versioned `KE-2025-employment-v1` in the shared domain module:

- Annual marginal bands: first KES 288,000 at 10%, next 100,000 at 25%, next
  5,612,000 at 30%, next 3,600,000 at 32.5%, remainder at 35%.
- Personal relief: KES 28,800 once across employers; tax is floored at zero.
- Enter insurance **relief**, not premiums. Payslip claims are combined per
  month and capped at KES 5,000; the combined annual claim is capped at 60,000.
  Annual P9 claims still require the user to check monthly eligibility.
- P9 column K / payslip taxable pay is already after allowable deductions.
  This worksheet never subtracts pension, SHIF, AHL or other deductions again.
- PAYE actually deducted is credited against annual tax after relief.
  Negative balance means potential overpayment, not an approved refund.
- Annual tax uses integer cents and basis points, rounding the total tax to
  nearest cent. Reconcile the worksheet with employer records and iTax.

Authoritative sources reviewed 1 November 2026:

- https://www.kra.go.ke/individual/filing-paying/types-of-taxes/individual-income-tax
- https://www.kra.go.ke/images/publications/P9-FORM-Template-2025.pdf
- https://www.kra.go.ke/images/publications/PAYE-AS-YOU-EARN-PAYE_4-01-2025.pdf

## Document privacy and extraction

All processing happens in the browser. There is no tax upload API or database
table. PDF.js reads text PDFs; Tesseract reads PNG/JPEG images and scanned PDF
pages. Workers, WASM and English trained data are copied from installed npm
packages to same-origin static assets by `prepare-document-assets.mjs` before
dev/build. Generated vendor assets are ignored by Git; licenses are copied too.
No third-party OCR/AI endpoint receives files or text. Refreshing or closing
the page discards the in-memory worksheet; downloads remain on the device.

Limits: 10 MB per document, 15 PDF pages, six scanned pages per document,
20 megapixels per uploaded image, and 24 worksheet entries. Password-protected
documents need unlocking first. Text extraction only suggests unique,
explicitly labelled figures. Unlabelled or ambiguous P9 table totals remain
blank. Users must check the original file and confirm every amount, including
zeroes. Editing a figure invalidates review and any calculated result.

Mixing a P9 and payslips for the same normalized employer label, duplicate
payslip months, and duplicate annual P9 entries is blocked. Different aliases
cannot be reliably detected; the user must confirm there is no overlapping
income. Export requires confirmation of complete annual employment coverage.
Partial documents are never multiplied to estimate a full year.

Tests cover statutory band boundaries, relief limits, duplicate coverage,
parsing ambiguity, local PDF extraction, actual image OCR, no upload requests,
same-origin reader assets, review/export gates and mobile layouts.
