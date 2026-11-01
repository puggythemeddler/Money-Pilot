# Financial and accessibility audit, 1 November 2026

Scope: money parsing, debt estimates and linked payments, dashboard/report
currency totals, multi-employer tax review, shared forms, keyboard navigation,
light/dark themes and narrow layouts. Synthetic users and documents are used for
write tests; live records are inspected without saving changes.

## Financial findings

- Dashboard balances, cash flow and category spending previously summed currencies
  together and formatted the result in the preferred currency. For a KES user,
  foreign accounts and transactions now stay outside the KES headline totals.
  Accounts and recent activity retain their own currency labels. A visible note
  explains that no currency conversion is applied. A mixed KES/USD browser case
  checks the dashboard against Reports for the same selected currency.
- Fractional minor-unit parsing could increment twice when the significant
  coefficient was entirely discarded. For example, `5e-3` KES became 2 cents
  rather than 1; `9e-4` KES became 2 cents rather than 0. Rounding now occurs once,
  based on the leading discarded digit at the correct decimal position. Signed
  and zero-/three-decimal currency cases are covered. Existing stored records are
  not rewritten because their original intended input cannot be reconstructed.
- BigInt aggregates outside the safe integer range could silently lose precision
  during conversion. Conversion now rejects them instead of displaying an
  inexact money value.
- Clearing a debt's minimum payment was omitted from the update, retaining the
  previous payment suggestion. Edits now send an explicit null, and the API
  accepts it. The decimal input remains a string while typing, preventing an
  exception from a temporarily incomplete value.

Debt full-term projections remain distinct from accrued interest or lender
settlement figures. Legacy and already-inclusive amounts are not opted into a
second interest charge. Tax review retains the verified 2025 employment-only
scope, actual earnings, one personal relief across employers, document-review
gates and local processing. This audit does not extend tax rules to other years.

## Accessibility findings

- Shared Field hints and validation messages were visually present without being
  programmatically linked to the control. Matching child controls now receive
  merged aria-describedby references and the error state; visible labels remain.
- Keyboard users had no direct skip link past the repeated desktop sidebar. The
  dashboard now offers a focus-visible skip link targeting its main landmark.
- Input boundaries were too faint against their surfaces. Input/select/textarea
  borders now use a stronger colour in both themes; actual computed border/fill
  contrast is checked separately from text palette contrast.
- Scroll padding and field scroll margins leave room for fixed mobile navigation.
  Browser checks cover focus entry, skip navigation, dialog close/Escape and
  restored focus, descriptions, layout overflow and theme contrast.

Relevant primary guidance:
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html

Automated and accessibility-tree checks do not constitute a complete screen-reader
test or a certification of WCAG conformance. The audit does not reconstruct past
rounded inputs, evaluate lender-specific fees/early-settlement terms, or file a
tax return. Detailed verification results accompany the release report.
