# Finance and UI corrections

## Correctness

- Monthly totals and transaction searches combine both date bounds, excluding
  records outside the requested period.
- Expenses now have an optional explicit `debtId`. Only personal expenses in
  the debt's currency may be linked, and the API verifies creditor ownership.
  A category is a reporting label/default, not evidence of which debt was paid.
- New payments made from Debts identify the creditor directly. Paid-off debts
  remain in the debt history but are excluded from the outstanding count/total.
- Editing or deleting a linked expense recalculates the debt from the ledger.

## Existing repayments

The additive migration creates an indexed, nullable debt link and foreign key.
It does not delete transactions or guess a creditor for existing expenses.
Historical category-only repayments remain in account balances and cash flow,
but do not reduce any debt until assigned. Therefore the corrected debt total
can increase until the user reconciles these entries.

The dashboard flags unallocated expenses in debt-linked categories. Transactions
labels those rows; use Edit → Payment for debt to assign the **whole expense**
to one creditor. This operation changes attribution, not the expense amount or
account balance. Do not assign an aggregate payment to one creditor unless that
is accurate; splitting a historical aggregate across creditors is a separate
reconciliation action and is not inferred automatically.

## Interface

- A five-column phone bar fits the viewport; More opens a native modal with
  every destination, theme control, and logout. Escape and focus trapping use
  the browser's native dialog behavior.
- First-run setup and Quick add precede summary cards. Phone summaries use a
  compact two-column layout. Zero spending no longer shows negative zero.
- Creation forms are open for empty lists and collapsed for populated lists;
  their summaries remain available. Record/payment editing stays separate.
- Actions announce successful saves; errors remain visible outside collapsed
  forms. Secondary text and primary-button contrast are stronger.
- Landing copy describes the implemented browser experience and financial
  overview, without claiming released native apps or reporting/receipt features.
- Email recovery limitations remain visible in a concise expandable notice.

## Release

Apply the committed PostgreSQL migration with `prisma migrate deploy` before
starting the updated API. Render's existing build command performs this step.
Deploy API before frontend, then verify dashboard, historical repayment
warnings, and mobile More. Existing browser sessions/auth security are preserved.
No production financial record should be changed as part of deployment checks.

The browser suite covers unrelated debts sharing a category, historical
allocation, deletion, cross-user denial, bounded dates, and mobile navigation.

Validation: 120 unit tests passed. The full 42-test browser run had 41 passes
and a sign-out/navigation timing issue in the new test; after waiting for the
logout redirect, all three financial/mobile regressions passed on a fresh
production build. Both application production builds and the PostgreSQL schema
validation passed. Migration encoding checks passed for all five migrations.
