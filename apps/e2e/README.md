# @moneypilot/e2e

Playwright browser e2e suite for the Money Pilot web app (Chromium, 18
tests): the critical user paths — auth and session protection, accounts,
transactions, transfers, and dashboard aggregation.

## Run

From the repo root:

```sh
npm run e2e
```

The first run installs nothing but may build the web app first if no
production build exists (`.next` missing), so it is slower; later runs reuse
the build. Install the browser binary once, inside this folder:

```sh
npx playwright install chromium
```

## How it works

- Playwright boots a disposable **production** server as its `webServer`
  (`apps/web/scripts/e2e-server.mjs`):
  - deletes and recreates a fresh SQLite database
    (`apps/web/prisma/e2e-playwright.db`) and pushes the schema
    (regenerating the SQLite client);
  - runs `next start -p 3105` with `NODE_ENV=production`,
    `APP_BASE_URL=http://localhost:3105`, a throwaway random
    `AUTH_JWT_SECRET`, and a raised `RATE_LIMIT_AUTH_MAX` (the suite
    registers/logs in far more often per minute than a real visitor — the
    production default stays untouched);
  - readiness is polled at `/api/health`.
- The server is **self-contained: no `.env` is needed** (verified on CI by
  running the suite with no `.env` present at all).
- Every test registers its own user (`uniqueEmail`), so tests share nothing
  and each one is a fully isolated scenario.
- One worker, serial (`workers: 1`): the SQLite-backed server and browser
  sessions stay stable; `retries: 1` on CI only.
- The base URL is `localhost` — not `127.0.0.1` — on purpose: the app's
  session cookies are `__Host-` (Secure) and Playwright's request context
  only exempts localhost from the no-Secure-cookies-over-http rule, which
  the API-based helpers (`createAccountViaApi`, pagination seeding) rely on.

## What each spec covers

| Spec                 | Covers                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `auth.spec.ts`       | register/login/logout, invalid + weak passwords, protected-route redirects, tampered session cookie, 401 after logout, re-login |
| `accounts.spec.ts`   | create/archive/unarchive, multi-currency accounts, rename           |
| `transactions.spec.ts` | income + expense entry, kind + search filters, USD formatting, API pagination |
| `transfers.spec.ts`  | same-currency transfer with balance checks, both legs in history    |
| `dashboard.spec.ts`  | aggregate values, empty states (with and without accounts)           |

The suite has already caught a real production bug pre-deploy: the CSRF
origin check originally compared against Next's middleware URL, which is
localhost-pinned under `next start` since Next 15.5 — it would have rejected
every browser POST behind Render's proxy.

## CI

The `playwright e2e (chromium)` job in `.github/workflows/ci.yml` installs
Chromium with system deps, builds the app, runs the suite, and uploads
`playwright-report/` as an artifact on failure.

## Troubleshooting

- **Port 3105 busy** — locally the config reuses an already-running server
  (`reuseExistingServer` outside CI); kill the stale one or it will be
  tested instead of fresh code.
- **Slow first run** — it includes a production build.
- **Flaky-looking waits** — the UI intentionally resets forms and merges
  filter state with the last server render; the specs wait for the rendered
  result (e.g. the "N transactions" header) between filter changes. Keep
  that pattern when adding specs.
