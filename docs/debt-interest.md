# Debt interest estimates

Existing rows default to NONE; a reference percentage never changes their balance.
INCLUDED also tracks the entered total without adding interest. FLAT and REDUCING
require a valid start date, a term of 1–600 months, and a fixed annual or monthly
nominal percentage (0–1000%, at most two decimal places).

FLAT uses original principal × monthly rate × term. REDUCING assumes fixed monthly
instalments starting one month after disbursement. It uses the annuity formula,
rounds the regular instalment up to a minor unit, rounds monthly interest to the
nearest minor unit, and adjusts the final instalment. Annual rates divide by 12;
monthly rates apply directly. Arithmetic uses BigInt and rejects unsafe totals.

The tracked balance is original entered principal plus estimated full-term interest
minus explicitly linked payments. Dashboard, Debts and Reports share this rule.
These are full-term projections, not accrued balances or early-settlement quotes.
No scheduled expense is inserted into the ledger: only actual recorded payments
affect cash flow. Fees, penalties, variable rates and early-payment savings are
excluded. Users should reconcile the estimate with the lender's statement.

Editing a debt explicitly selects a method and previews its new total. No legacy
loan is automatically opted in. An already-inclusive lender total should use
INCLUDED, preventing a second interest charge. New projected debts suggest the
monthly instalment when opening Pay rather than suggesting the full future total.
