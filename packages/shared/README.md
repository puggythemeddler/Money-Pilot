# @moneypilot/shared

Shared domain rules for Money Pilot — pure TypeScript with no build step.
Exported as source (`src/index.ts`) and consumed directly by `apps/web`
through the npm workspace dependency, so any change here is picked up by the
app on the next dev/build without a publish step.

## What lives here

- `money.ts` — the money model:
  - `parseMoneyToMinorUnits` — BigInt-based, exact, currency-aware
    conversion of a user-entered decimal into integer **minor units**
    (deterministic rounding, exponent support)
  - `formatMoney` — minor units back to a display string
  - `minorToNumber` and signed-amount helpers used at the service boundary
- `currency.ts` — the ISO 4217 registry: every African currency plus
  USD/GBP/EUR, with exact minor-digit rules (0 for UGX/TZS/XOF/XAF/BIF/DJF/
  GNF/KMF/RWF, 3 for TND/LYD, 2 for the rest). KES is the default.
- `finance.ts` — exact FX conversion for cross-currency transfers
  (deterministic integer rate-fraction math, no floats)
- `schemas/` — the Zod request schemas every API route validates against
- `errors.ts` — the shared error-code contract for consistent API errors

The rule of the house: **money is never a float**. Amounts are integer minor
units end-to-end; see the root README's "Money model" section for the full
semantics (signed ledger amounts, derived balances, atomic transfers).

## Scripts

| Script                     | What it does                                        |
| -------------------------- | ---------------------------------------------------- |
| `npm run test`             | vitest — 72 tests: exact parsing, per-currency minor digits, FX conversion, registry, schemas |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`                            |

From the repo root: `npm run test -- --filter=@moneypilot/shared`
(CI runs the same suite).

## Changing shared rules

Change the source here, extend the matching test under `tests/`, and
rerun. There is no build output to regenerate — the app compiles this
package's TypeScript as part of its own build.
