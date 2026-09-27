# MoneyPilot Design Guide

This document describes the design system as it actually exists in the
codebase — tokens, primitives, and the financial-UI rules that keep the
product coherent. It is written for anyone adding screens or components to
the web app (`apps/web`).

The short version: **MoneyPilot is a hand-rolled, shadcn/ui-style component
foundation on Tailwind CSS v4 tokens — warm orange brand with a calm blue
accent on warm stone neutrals, in light and dark — optimized for reading
money accurately.** When a new shared component is needed, extend
`src/components/ui/` in this style rather than introducing another UI
library.

## 1. Design principles

1. **Numbers first.** This is a money product: amounts are the interface.
   Everything serves legible, honest numbers — `tabular-nums`, explicit
   signs, always the currency.
2. **Derived, never invented.** Every figure on screen is computed from the
   user's own data. Empty states say so plainly ("No spending recorded this
   month yet.") instead of showing zeros or placeholders that look like data.
3. **Calm and quiet.** Orange is the single brand accent (actions, links,
   focus), blue is reserved for information; warm stone neutrals and generous
   white space. Money is stressful enough; the UI shouldn't be.
4. **Accessible by default, in both themes.** Focus rings on everything,
   labels on every input, errors as `role=alert`, status conveyed by
   sign/text and never by color alone.

## 2. Design tokens (`src/app/globals.css`)

Tokens are Tailwind v4 `@theme` variables — there is exactly one source of
truth, no theme config file. Two layers:

- **Static palette scales** — `primary-*` is the orange brand scale
  (50 `#fff7ed` → 950 `#431407`; `primary-600 #ea580c` is the MoneyPilot
  orange: buttons, links, focus, selection). `accent-*` is the blue scale,
  reserved for informational emphasis (info alerts, charts).
- **Semantic runtime tokens** — plain CSS variables (`--page`, `--surface`,
  `--surface-2`, `--line`, `--heading`, `--body`, `--muted`, `--faint`)
  re-exported through `@theme inline`, so utilities like `bg-surface` /
  `text-heading` / `border-line` resolve at paint time and **flip with the
  `.dark` class on `<html>** — one class serves both themes. Prefer these
  over hardcoded neutral scales everywhere.

| Token          | Light → Dark                        | Use                              |
| -------------- | ----------------------------------- | -------------------------------- |
| `page`         | `#fafaf9` → `#0d0c0b`               | App background                   |
| `surface`      | `#ffffff` → `#191715`               | Cards, nav, inputs               |
| `surface-2`    | `#f5f5f4` → `#23201e`               | Chips, hover rows, nested panels |
| `line`         | `#e7e5e4` → `#322f2c`               | Borders, dividers                |
| `heading`      | `#1c1917` → `#fafaf9`               | Primary text                     |
| `body`         | `#57534e` → `#d6d3d1`               | Secondary text                   |
| `muted`        | `#79716b` → `#a8a29e`               | Tertiary text                    |
| `faint`        | `#a8a29e` → `#78716c`               | Timestamps, placeholders         |

Base layer rules (also in `globals.css`):

- Body: `bg-page text-heading`, antialiased, optimized legibility.
- Selection: `bg-primary-600/25` (orange tint), `text-primary-900` /
  `dark:text-primary-200`.
- Global focus: `:focus-visible { outline-2 outline-offset-2 outline-primary-600 }`
  — every interactive element is focus-visible styled without per-component work.

**Dark mode mechanics:** the `.dark` class lives on `<html>` (Tailwind v4
`@custom-variant dark`). A blocking inline script in the root layout applies
the stored choice (`localStorage "mp-theme"`) or the system preference before
first paint — no theme flash. `ThemeToggle` (`src/components/ThemeToggle.tsx`,
in the sidebar, the auth layout and Settings on mobile) flips the class and
persists the choice. Saturated status colors (red/emerald/amber) pair with
`dark:text-*-400` variants; tinted chips and callouts pair with
`dark:bg-*-950/60`.

Status colors are used semantically and sparingly: red-600 for money out and
errors, emerald-600 for money in and successes, amber for warnings
(unverified email, archived rows). They always appear with a sign, a label,
or an icon — never as the only signal.

## 3. Component foundation (`src/components/ui/`)

Hand-rolled shadcn-style primitives. No component library dependency, no
CLI-generated registry — this directory *is* the component foundation, kept
deliberately small:

- **`Button`** — variants `primary` (orange `primary-600`), `secondary`
  (inverted: `bg-heading text-page` — dark button in light, light button in
  dark), `ghost`, `outline`, `danger` (red-600); sizes `sm`/`md`/`lg`;
  built-in `loading` prop that disables the button, swaps in a spinner, and
  sets `aria-busy`. Default is `primary`/`md`.
- **`Input`, `Select`, `Textarea`** — consistent border (`border-line`),
  radius, focus ring; money inputs add `inputMode="decimal"`.
- **`Field`** — label + control + optional hint; every control has a `htmlFor`
  pair. Use it for every form field; never a bare input.
- **`Alert`** — variants `info`/`success`/`error`/`warning`; renders
  `role="alert"` for errors (screen readers announce them) and `role="status"`
  otherwise.
- **`Card`** family — `Card`, `CardHeader`, `CardTitle`, `CardDescription`,
  `CardContent`. The workhorse of every dashboard page: summary cards,
  form panels, and list panels are all Cards.

Rules for extending the foundation:

- A component used by **two or more feature areas** belongs in `ui/`; a
  single-feature component lives next to its feature (`components/finance/`).
- Extend with `variant`/`size` props and Tailwind class maps — the same
  pattern as `Button` — not with boolean prop explosions.
- `cn()` (`src/lib/cn.ts`) is the only class-merging helper.
- Icons: inline SVGs via the `Icons` map in `src/components/Logo.tsx`
  (stroke, `currentColor`, 20px in cards / 24px in nav). No icon package.

## 4. Layout

- **App shell:** `Sidebar` (desktop ≥ lg, sticky, full nav) + `BottomNav`
  (mobile, the five core sections). The nav has `aria-label`s
  ("Dashboard navigation" / "Mobile navigation"); the active route gets an
  orange active state (`aria-current="page"`). Unbuilt sections appear
  as visibly-disabled items ("Calendar soon") — honest about scope.
- **Auth pages** are a single centered Card on the plain background; no nav.
- **Manager pages** (accounts, transactions, transfers, budgets, debts,
  bills, categories) share one rhythm: a create form Card on top, filter bar
  (when list state exists), then the list Card; explanatory Card at the
  bottom for product rules ("Balances are always derived…").
- Responsive by grid collapse, not by hiding: manager forms go from
  multi-column grids (`lg:grid-cols-4/5`) to single column; lists wrap.

## 5. Financial UI rules

These are invariants, not preferences:

1. **Never render a raw number as money.** Always `formatMoney()` from
   `@moneypilot/shared` — it maps ISO codes to the registry symbol
   (`KSh 1,234.50`, `$ 12.99`), applies the currency's own minor-unit
   digits (0 for UGX, 2 for KES, 3 for BHD-style), and keeps grouping
   consistent across clients.
2. **Amounts use `tabular-nums`** so columns of figures align.
3. **Direction of flow is always explicit:** a leading `−`/`+` sign, red for
   out / emerald for in. The sign carries the meaning; the color is a
   reinforcement.
4. **The currency is always visible** — in the amount itself, or as a badge
   in multi-currency lists (`Pocket money (KES)`).
5. **Every money input is parsed against the entity's currency**
   (`parseMoneyInputToMinorUnits`) — never a bare `Number()`. The minor-unit
   integer is the only representation in storage and transport; conversion
   happens exactly once, at the input boundary.
6. **Empty states are sentences, not zeros** — "No transactions yet — record
   the first one.", with a link to the action that fixes it.
7. **Destructive or derived-honest actions** (archive, delete) keep history
   intact and say so; confirmations are inline, not modal.
8. **Shared-household items are labeled, never silently mixed**: joint
   accounts carry an orange `Shared · <household>` chip, shared transactions a
   `Shared · <recorder>` chip (attribution), and account selects append
   `· shared`. Household-scope money keeps the same rules as personal money —
   `formatMoney`, explicit signs, `tabular-nums`.
9. **Privacy is visible in the UI**: the household page states that personal
   accounts stay private; the invite link is shown exactly once with a copy
   button (only its digest is stored); the dashboard household card links to
   the shared view instead of mixing totals into the personal summary.

## 6. Motion

Minimal and functional only: color/hover transitions on interactive
elements, the button spinner, Tailwind's default easing. No page
transitions, no decorative animation. Numbers never animate (a number that
counts up invites misreading).

## 7. Do / Don't

**Do**
- Use `Field` + `htmlFor` for every form control.
- Use `Alert variant="error"` for form/API errors; rely on its `role="alert"`.
- Add `tabular-nums` wherever a column of amounts appears.
- Wait for server re-render (the list actually changed) before re-enabling
  forms — e2e tests depend on this reset behavior.
- Put new shared primitives in `ui/` with a `variant` map.

**Don't**
- Introduce a second UI library, icon pack, or CSS-in-JS runtime.
- Hardcode a currency symbol or decimal count — go through `formatMoney`
  and the shared currency registry.
- Show invented or zero-filled data in empty states.
- Use color as the only signal (red/green without a sign or label).
- Add page-level animation or spinners that hide stale numbers.

## 8. Pointers

- Tokens and base styles: `apps/web/src/app/globals.css`
- Primitives: `apps/web/src/components/ui/`
- Theme switching: `apps/web/src/components/ThemeToggle.tsx` + the no-flash
  script in `apps/web/src/app/layout.tsx`
- Money and currency domain rules: `packages/shared/src/money.ts`,
  `packages/shared/src/currency.ts`
- Example manager (forms + filters + list): `apps/web/src/components/finance/TransactionsManager.tsx`
- App shell: `apps/web/src/components/AppNav.tsx`
