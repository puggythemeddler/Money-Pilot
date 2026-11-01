# UI and tax preparation release audit

## Design direction

MoneyPilot is a personal finance workspace for reviewing balances and preparing
employment tax figures. The tax page should feel like a working document,
with source review leading to a legible reconciliation, rather than a sales page.

Retain the established palette: paper `#fafaf9`, surface `#ffffff`, ink
`#1c1917`, action orange `#c2410c`, dark page `#0d0c0b`, dark surface `#191715`.
Use the system sans family for form labels and guidance; reserve monospace for
financial amounts and rule identifiers. This avoids loading third-party fonts
and keeps the worksheet familiar alongside the existing ledger.

Layout, left aligned:

    Tax preparation                         Kenya / income year
    Supported scope and privacy (readable line length)
    Documents -> reviewed amounts -> annual reconciliation
    Coverage confirmation -> worksheet download -> iTax

The numbered steps are a real document-review sequence. Remove the decorative
uppercase brand eyebrow and uppercase year label, and constrain the scope and
privacy text to a readable measure. Keep orange for actions and the active page.
Amounts, not decorative cards, carry the resulting worksheet's hierarchy.

## Findings corrected

- Replacing a document, including a failed read, now invalidates review and export
  readiness before parsing begins. Old figures cannot silently remain approved.
- Annual P9 rows export `2025 annual`, rather than an empty period.
- Negative or malformed document amounts are not converted into positive
  suggestions; ambiguous fields remain blank for manual review.
- Conflicting explicit tax years across pages block the document's calculation.
- Reading can be cancelled, and is aborted on leaving the page. PDF/OCR resources
  are cleaned up; late results cannot overwrite a newer read.
- Reading disables the affected document fields to avoid overwriting edits.
- Document IDs use a monotonic counter instead of timestamps.
- Light/dark wordmark contrast was strengthened during the theme review.
- Dashboard month selection now uses the user's timezone, matching Reports
  around month boundaries; Nairobi no longer shows the prior month's totals
  between local midnight and UTC midnight.

## Release boundaries

Follow-up: employer dates sit beside employer and document type, with date fields
stacking on mobile. Debt interest settings form a single section with an immediate
three-figure preview: interest, total, and monthly instalment. Keep existing colors
and type, and distinguish full-term estimates from entered lender balances in all
debt views. Legacy debts are not opted in by a stored reference percentage.

2025, full-year Kenyan residents, ordinary employment income only. Chargeable
pay is supplied from reviewed employer documents after deductions. Eligibility
and deductions are not independently established from gross pay. No direct
filing, KRA credentials, original-document server storage, or refund approval.
Unlabelled P9 table totals require manual entry. Browser tests use synthetic
documents, never a user's real P9 or payslip.
