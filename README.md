# Money Pilot

Money Pilot is a privacy-first personal finance platform built for Kenyan users (KES-first)
and designed to work anywhere. It runs as a web app now, with a companion Android/iOS app
planned for a later phase.

Everything you record stays yours. The product deliberately avoids unsolicited monetization:
no ads, no data brokerage, no financial product upsells. It only spends from an optional
monthly core budget you choose explicitly.

> Status: **Phase 3 complete — production-ready with shared households.** Authentication,
> invite-only mode, admin foundation, data export / account deletion, accounts, categories,
> transactions, income/expenses, transfers, budgets, debts, recurring bills **and shared
> households (joint accounts for families/couples with per-member permissions)** are implemented
> and end-to-end tested. CI is fully green (lint/typecheck/unit tests/build, dependency audit,
> Semgrep, Playwright browser e2e, optional Snyk) and the Render + Neon deployment path is
> ready — see [docs/deployment.md](docs/deployment.md) and [DESIGN.md](DESIGN.md).

## Stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Framework  | Next.js (App Router) + React 19, TypeScript                       |
| API        | Route handlers under `apps/web/src/app/api`                       |
| Database   | Prisma 6 + PostgreSQL (canonical; Neon in production) / SQLite twin (local dev) |
| Auth       | bcrypt (12 rounds), 15-minute HMAC access JWTs, opaque rotating refresh tokens |
| Validation | Zod schemas in `packages/shared`                                  |
| Styling    | Tailwind CSS v4                                                   |
| Monorepo   | Turborepo; `apps/web` (app), `apps/e2e` (browser e2e), `packages/shared` (shared code) |

## Money model

Monetary values are **integer minor units** — never floats. A user-entered decimal amount is
converted exactly once at the API boundary by `parseMoneyToMinorUnits` in
`packages/shared/src/money.ts` (BigInt-based, supports exponents, deterministic rounding).
Formatting back to a currency string uses `formatMoney`.

- **Every African ISO 4217 currency is supported** — a user anywhere in Africa can track money
  in their local currency (40 African codes plus USD/GBP/EUR for international accounts, KES is
  the default). Minor-unit digits follow ISO 4217 exactly: 0 for UGX/TZS/XOF/XAF/BIF/DJF/GNF/
  KMF/RWF, 3 for TND/LYD, 2 for the rest. Amount parsing is currency-aware: validation schemas
  keep the raw value and services convert against the entity's actual currency (the account's
  currency, the input currency on create, or the stored currency on update), so a UGX amount
  like `1500.60` rounds to the correct minor unit instead of being mis-scaled by a hardcoded
  currency.

- `Transaction.amountMinor` is *signed*: expenses are negative, income is positive, transfer
  legs are `−amount` (out) and `+amount` (in). The sign is your balance ledger.
- Stored as a 64-bit integer field (`BIGINT`): the practical ceiling is JavaScript's
  `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991 minor units) — amounts are decoded to
  `number` exactly at the service boundary via `minorToNumber`.
- **Balances are derived, never stored.** An account's balance is its opening balance plus the
  sum of all *open* (non-deleted) transactions. Deleting or editing a transaction changes the
  balance automatically and consistently.
- Transfers are atomic: one `Transfer` row plus two linked `Transaction` legs written in a
  single database transaction. Deleting a transfer soft-deletes the bundle so money never
  appears or disappears mid-way.
- Accounts and categories are archive-only; transactions and transfers are soft-deleted,
  so history (and audit) is never destroyed.

### Limits and semantics

- Transfers between any two of your own accounts. Cross-currency transfers carry an exact
  decimal exchange rate (`1 from = rate to`); the destination leg is converted with an exact
  rate fraction and stored in the destination currency. Transfers are editable in place
  (amount, rate, date, description) and both legs are recomputed atomically.
- Insufficient-balance is intentionally NOT enforced — credit accounts and overdrafts are
  legitimate, so balance is allowed to go negative.
- Category `kind` must match the transaction kind (an expense cannot use an income category).
- Archived accounts and categories can't receive new entries but stay visible with history.

### Shared households (Phase 3)

Personal ledgers stay private by default. A user can create a **household** (one per user) and
add **joint accounts** that every member sees, with per-member permissions:

- **Visibility rule (single choke point)**: an account is visible to a user when it is their own
  personal account *or* a joint account of their household — `resolveAccountForUser` in
  `apps/web/src/lib/finance/households.ts`. Everything else returns 404 (no existence leak).
- **Recording**: joint accounts accept entries from members with the `canRecord` permission
  (granted at invite time, changeable by the owner at any time); read-only members get 403 on
  writes but full read access. Every entry stores its recorder for attribution ("recorded by").
- **Transfers** are visible only when *both* accounts are visible — a member's transfer from
  their private account into a joint account shows its in-leg and balance effect to others, but
  never the transfer row (it names a private account).
- **Dashboard stays personal**: totals, spending and recent activity count only personal
  accounts; a household card links to the combined household view (month totals, per-member
  spending, shared recent activity with attribution).
- **Invitations**: single-use links valid 14 days; only the SHA-256 digest is stored (a leaked
  database cannot leak live invites). Accepting is atomic — a failed join never burns the invite.
- **Lifecycle**: the owner manages the household (rename, joint-account create/archive,
  permissions, member removal). Any member may leave: an owner leaving passes ownership to the
  longest-standing member; the last member leaving archives the household and its joint accounts
  (history is never destroyed). Budgets, debts and bills stay personal this phase.

## Repository layout

```
apps/api           Standalone MoneyPilot backend (Hono) — see apps/api/README.md
  prisma/schema.prisma        Canonical PostgreSQL schema (production migrations)
  prisma/schema.sqlite.prisma Generated SQLite twin (local dev + e2e; regenerate via db:schema:sqlite)
  scripts/                   db twin generator, prod env check, admin bootstrap
  src/lib/finance     Financial domain services (ownership + audit on every write)
  src/lib/finance/households.ts  Household/membership resolver — the single choke point
                      for account visibility across all finance services
  src/routes/…        Route handlers: auth, accounts, categories, transactions, transfers,
                      budgets, debts, bills, dashboard, household, admin, users
apps/web           Next.js application (UI only) — see apps/web/README.md
  src/lib/server-api.ts      Server components fetch the API, forwarding auth cookies
  next.config.ts     /api/* proxied, same-origin, to the MoneyPilot API service
apps/e2e          Playwright browser e2e suite (Chromium) — see apps/e2e/README.md
packages/shared   Shared domain rules: money (minor units), currency, FX, zod schemas,
                  error contract — see packages/shared/README.md
scripts/audit.mjs Dependency-audit CI gate (npm audit + reviewed allowlist)
security/semgrep-rules.yml  Custom static-analysis security rules (clean on main)
DESIGN.md         Design system guide (tokens, primitives, financial-UI rules)
docs/deployment.md  Production deployment guide (being updated for the api/web split)
render.yaml     Render Blueprint (being updated for the api/web split)
.github/workflows/ci.yml   CI: lint, typecheck, unit tests, build, e2e, audit, Semgrep
.github/workflows/snyk.yml Optional Snyk scan (runs only with a SNYK_TOKEN secret)
```

## Production deployment

Target topology: GitHub → **Vercel** (`apps/web`, frontend-only) + **Render**
(`apps/api`, the standalone Hono backend) → **Neon PostgreSQL**. The web app
proxies every `/api/*` request, same-origin, to the API service — no CORS
surface and same-origin cookies. Required environment, service setup and the
post-deploy smoke test are documented in
**[docs/deployment.md](docs/deployment.md)** (currently being updated for the
split; the API service contract is fully documented in
`apps/api/README.md`).

## Getting started

Requirements: Node.js 20+ (developed on 24), npm.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Prepare the local database (SQLite twin — zero-install, in `apps/api`):

   ```sh
   npm run db:dev --workspace @moneypilot/api
   ```

   `db:dev` generates the SQLite client from `apps/api/prisma/schema.sqlite.prisma`
   and creates `apps/api/prisma/dev.db`. (Developing against PostgreSQL instead is
   also supported: point `DATABASE_URL` at a Postgres instance and run
   `npx prisma migrate dev` against the canonical schema.)

3. Configure environment variables:

   ```sh
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   At minimum set `AUTH_JWT_SECRET` (in `apps/api/.env`) to a strong random value:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. Start the development servers (the API on :4000 and the web app on :3000):

   ```sh
   npm run dev        # from the repo root
   ```

   Open http://localhost:3000. The web app proxies `/api/*` to the API
   (`MONEYPILOT_API_ORIGIN` in `apps/web/.env`).

## Environment variables

Backend variables live in `apps/api/.env` (see `apps/api/.env.example`); the
frontend-only web app has a single variable in `apps/web/.env`.

| Variable                       | Where | Meaning                                                        | Default            |
| ------------------------------ | ----- | -------------------------------------------------------------- | ------------------ |
| `DATABASE_URL`                 | api   | Prisma database URL (`file:./dev.db` for SQLite)               | —                  |
| `APP_BASE_URL`                 | api   | Public web URL used to build email links and validate origins  | `http://localhost:3000` |
| `AUTH_JWT_SECRET`              | api   | HMAC secret for access tokens (48+ random bytes recommended)   | —                  |
| `AUTH_REFRESH_TTL_DAYS`        | api   | Refresh-token lifetime in days                                 | `30`               |
| `PRIVATE_MODE`                 | api   | `true` = invite-only registration                              | `false`            |
| `SEED_ADMIN_EMAIL`             | api   | Bootstrap admin email (read by the bootstrap script)           | —                  |
| `SEED_ADMIN_PASSWORD`          | api   | Password for the bootstrap admin account                       | —                  |
| `RATE_LIMIT_AUTH_MAX`          | api   | Auth request cap per IP per window                             | `20`               |
| `RATE_LIMIT_AUTH_WINDOW_SECONDS` | api | Auth rate-limit window                                         | `60`               |
| `ALLOWED_ORIGINS`              | api   | Comma-separated extra origins accepted by the CSRF check      | —                  |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | api | SMTP for email delivery; falls back to console | — |
| `MONEYPILOT_API_ORIGIN`        | web   | API origin that `/api/*` is proxied to                         | `http://localhost:4000` |

In invite-only mode (`PRIVATE_MODE=true`) no one can register without an invitation, so a
private deployment needs a first administrator. Bootstrap it once as a separate step:

```sh
cd apps/api
$env:SEED_ADMIN_EMAIL="admin@example.com"     # or export in your shell
$env:SEED_ADMIN_PASSWORD="a-strong-password"
node scripts/bootstrap-admin.mjs
```

The script creates the admin idempotently and never overrides an existing account with that
email. It is a standalone script (not triggered by login), so it is safe to run at deploy time
and can be re-run — subsequent runs are a no-op.

## Security model

- **Passwords** hashed with bcrypt (12 rounds); policy: 8–72 characters, must contain a letter
  and a digit.
- **Access tokens**: short-lived (15 min) HMAC-signed JWTs. Sent two ways depending on client:
  - *Cookie mode* (browser): tokens live in `__Host-mp_access` / `__Host-mp_refresh`
    HttpOnly `__Host-` cookies (Secure, SameSite=Lax, Path=/). Cookie-mode API responses
    **never** contain token values in the body.
  - *Token mode* (mobile): the client sends `X-Use-Token-Auth: true`; the API returns tokens in
    the JSON body and sets **no** cookies.
- **Refresh tokens**: opaque, stored only as SHA-256 digests, rotated atomically on every
  refresh. Reusing an already-rotated token revokes the whole descendant session chain.
  Concurrent refreshes are serialized per token so exactly one wins.
- **Session validation at request time**: every authenticated request cross-checks the session
  row and device (revoked, expired, ownership) — logout, device revoke, and logout-all take
  effect immediately, not when a token happens to expire.
- **CSRF (two layers)**: unsafe cross-origin POST/PUT/PATCH/DELETE requests are rejected unless
  the Origin matches the request's `Host`/`X-Forwarded-Host` — in the Next.js web middleware
  (defense in depth) and again in the API (`Host`/`X-Forwarded-Host` plus `APP_BASE_URL` and the
  `ALLOWED_ORIGINS` list, since behind the proxy the Origin is the web app's origin). Security
  headers (X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS
  behind TLS proxies) are set on every response.
- **Roles & lifecycle**: admin routes require the `ADMIN` role; deleted/disabled accounts cannot
  authenticate. Invitation tokens are stored only as digests and are single-use.
- Account deletion anonymizes personal information, revokes every session, and hard-stops
  authentication while retaining audit rows for compliance.
- Auth endpoints are rate-limited per IP. `assertProdConfig` refuses to run on production
  builds unless served over https or loopback http.

### Security tooling

| Tool    | Where                                             | What it checks                                        |
| ------- | ------------------------------------------------- | ----------------------------------------------------- |
| Semgrep | CI `semgrep` job (`semgrep/semgrep` image)        | Custom rules (`security/semgrep-rules.yml`: no raw SQL, no `dangerouslySetInnerHTML`, no `eval`, no committed secrets) plus the `auto` registry ruleset. Locally: `pip install semgrep`, then `semgrep scan --config security/semgrep-rules.yml` |
| npm audit | CI `audit` job via `scripts/audit.mjs`         | High/critical vulnerabilities in production dependencies, with a reviewed allowlist for build-time-only tools (the Prisma CLI chain currently has no patched release) |
| Snyk    | `.github/workflows/snyk.yml` (optional)          | Deep dependency scan — runs only when a `SNYK_TOKEN` repo secret is configured; otherwise every step skips with an explicit note |
| Playwright | `apps/e2e` (`npm run e2e`)                    | Browser-level regression suite: auth/session protection, CSRF origin behavior, account CRUD + archive, transactions + filters + pagination, transfers, dashboard aggregation |

## Data privacy

- **Export** — `GET /api/users/export` returns a JSON bundle of everything the account has,
  including accounts, categories, transactions and transfers. Tokens, sessions, and password
  hashes are never exported.
- **Delete account** — `POST /api/users/delete-account` requires the current password and the
  literal confirmation `DELETE`. It signs the user out everywhere and anonymizes the account.

## API

All routes below require an authenticated session (`/api/health` and the
`/api/auth/*` endpoints excepted). Money amounts accept a decimal number or
string and are always validated with the shared Zod schemas.

| Route                          | Methods            | Description                               |
| ------------------------------ | ------------------ | ----------------------------------------- |
| `/api/accounts`                | `GET`, `POST`      | List (balances derived), create account   |
| `/api/accounts/:id`            | `GET`, `PATCH`     | Account detail, update/archive            |
| `/api/categories`              | `GET`, `POST`      | List (with transaction counts), create    |
| `/api/categories/:id`          | `PATCH`            | Update/archive                            |
| `/api/transactions`            | `GET`, `POST`      | List with filters (`kind`,`account`,`category`,`from`,`to`,`q`), create |
| `/api/transactions/:id`        | `PATCH`, `DELETE`  | Update, soft-delete (deletes transfer bundle) |
| `/api/transfers`               | `GET`, `POST`      | List, create (atomic two-leg transfer)    |
| `/api/transfers/:id`           | `PATCH`, `DELETE`  | Edit in place, soft-delete transfer + both legs |
| `/api/budgets`                 | `GET`, `POST`      | List, create monthly budget               |
| `/api/budgets/:id`             | `PATCH`            | Update/archive                            |
| `/api/debts`                   | `GET`, `POST`      | List, create debt (tracked, not traded)   |
| `/api/debts/:id`               | `PATCH`            | Update/archive                            |
| `/api/bills`                   | `GET`, `POST`      | List, create recurring bill              |
| `/api/bills/:id`               | `PATCH`, `POST`    | Update/archive, record a payment           |
| `/api/dashboard`               | `GET`              | Overview summary for the dashboard        |
| `/api/household`               | `GET`, `POST`, `PATCH`, `DELETE` | Household view, create, rename (owner), leave |
| `/api/household/overview`      | `GET`              | Aggregated shared finances (month totals, per-member spending, recent activity) |
| `/api/household/accounts`      | `POST`             | Create a joint account (owner)           |
| `/api/household/accounts/:id`  | `PATCH`            | Rename/archive a joint account (owner)   |
| `/api/household/invites`       | `GET`, `POST`      | List (owner), create single-use invite link |
| `/api/household/invites/:id`   | `DELETE`           | Revoke a pending invite (owner)          |
| `/api/household/invites/accept` | `POST`            | Accept an invite token (atomic join)     |
| `/api/household/members/:id`   | `PATCH`, `DELETE`  | Set `canRecord` (owner), remove member (owner) |

Every write is recorded in the audit log with the acting user, entity and context. All queries
are scoped to what the user may see — their personal accounts plus their household's joint
accounts; anything else returns 404, and writes to shared accounts require record permission.

## Admin API

Only available to `ADMIN` users.

| Route                                  | Description                                  |
| -------------------------------------- | -------------------------------------------- |
| `POST /api/admin/invitations`          | Create an invitation (returns shareable link)|
| `GET /api/admin/invitations`           | List invitations (filter by `?status=`)      |
| `DELETE /api/admin/invitations/:id`    | Revoke a pending invitation                  |
| `GET /api/admin/users`                 | Paginated user list (`?limit=&offset=`)      |

## Scripts

```sh
npm run dev           # development servers (apps/api :4000 + apps/web :3000)
npm run build         # production build (all workspaces)
npm run test          # unit tests (packages/shared)
npm run e2e           # Playwright browser e2e (apps/e2e; rebuilds both apps every run)
npm run lint          # eslint (all workspaces)
npm run typecheck     # TypeScript checks (all workspaces)
node scripts/audit.mjs  # dependency audit gate (what CI runs)

# apps/api
npm run db:dev --workspace @moneypilot/api     # generate SQLite client + create prisma/dev.db
npm run db:schema:sqlite --workspace @moneypilot/api  # regenerate the SQLite twin
npm run db:generate --workspace @moneypilot/api # generate the canonical PostgreSQL client
npm run db:deploy --workspace @moneypilot/api   # prisma migrate deploy (production)
```

First e2e run needs the browser binary once: `npx playwright install chromium`
(run inside `apps/e2e`). The suite boots its own disposable stack — the API on
http://localhost:4000 against a fresh SQLite database plus the web app on
http://localhost:3105 proxying to it — your `dev.db` is never touched, and each
test registers its own isolated user.

## Verification checklist

Each phase is finished only when the following all pass:

- [x] Unit tests (`packages/shared`) — 84 tests, exact money parsing, per-currency minor units,
      FX rate conversion, currency registry & schemas (finance + household schemas)
      — TypeScript (`npm run typecheck`)
- [x] ESLint (`npm run lint`)
- [x] Production build (`npm run build`)
- [x] API/DB consistency (PostgreSQL migrations: canonical schema with a single
      `postgres_baseline` migration applied via `prisma migrate deploy`; SQLite twin
      for local dev/e2e is generated from it, so they can never drift)
- [x] CI (GitHub Actions: lint, typecheck, unit tests, production build, dependency audit
      with reviewed allowlist, Semgrep custom + registry rules, Playwright e2e — see
      `.github/workflows/ci.yml`; optional Snyk workflow runs only with a `SNYK_TOKEN`)
- [x] Playwright browser e2e (Chromium, 23 tests) — register/login/logout, invalid and
      tampered sessions, protected-route redirects, account create/archive/rename,
      transactions + kind/search filters + API pagination, cross-currency amounts,
      transfers (both legs), dashboard aggregation and empty states, and households
      (owner creates household + joint account + invite link, member joins via link,
      records with attribution, read-only members blocked, personal-account privacy,
      permission flips/removal, last-member-leave archives). Caught a real
      production bug before deploy: the CSRF origin check relied on Next's middleware URL,
      which is localhost-pinned under `next start` since 15.5 and would have rejected all
      browser POSTs behind a proxy. Also caught a stale-`.next` footgun: the e2e server
      now rebuilds every run so the served build always matches the source tree.
- [x] End-to-end smoke — public + private-mode auth scenarios, a 55-assertion finance suite
      (accounts, categories, transactions, transfers, dashboard, cross-user isolation, UI renders)
      and a 94-assertion advanced suite (64-bit amounts, exact FX transfers, transfer editing,
      budgets, debts, bills, universal African currencies — including cross-user isolation and
      UI renders)
- [x] Static security — Semgrep custom rules verified clean on the repo (each rule also
      verified to fire on a deliberately vulnerable scratch file); Snyk workflow is
      token-gated and configuration-reviewed only (no token available locally)
- [x] Responsive UI review (no dead links or buttons)

## Roadmap

1. **Foundation** *(done)* — repo, architecture, database, auth, user model, design system,
   env config, private mode, admin, data privacy, docs.
2. **Financial engine** *(done)* — accounts, transactions, categories, income, expenses,
   transfers (exact-rate cross-currency FX included), monthly budgets, debt tracking, and
   recurring bills — modeling, services, API, UI, tests all complete. Currency-universal:
   every African ISO 4217 currency works end-to-end (per-currency parsing, formatting,
   budgets, debts, bills, cross-currency transfers).
3. **Shared households** *(done)* — every user has a fully isolated personal ledger (cross-user
   access is tested to return 404) plus opt-in sharing: households with joint accounts a family
   or couple can both see and record into (per-member record permissions, single-use invite
   links, combined household view with attribution, audit on every write). Personal accounts
   stay private by default — sharing is opt-in per household account.
4. **Budgets & goals** *(partial)* — monthly budgets are done; savings/spending goals and
   budget rollovers are still to come.
5. **Debts & investments** *(partial)* — debt tracking is done ("tracked, not traded" — no
   money movement); payoff plans, installments, and investments are still to come.
6. **Reports & insights** — analytics, charts, exports.
7. **Mobile apps** — Android/iOS companion clients.
8. **Hardening & subscriptions** — optional paid tiers for hosting/storage only.

Out of scope by design: cryptocurrency, securities trading, an insurance marketplace,
third-party payment processing, social networking, and an unsolicited advisory engine.

## Known limitations

- Email is printed to the server console when no SMTP is configured.
- Local development runs on the generated SQLite twin; production is PostgreSQL
  (Neon). The twin is generated from the canonical schema (`db:schema:sqlite`),
  so both model the exact same data.
- The PostgreSQL production path is verified locally only up to build + the
  pre-deploy environment check (no PostgreSQL instance is available in this
  environment); the first real `prisma migrate deploy` runs on Render — see
  docs/deployment.md for the smoke test to run after the first deploy.
- Cell values (including `amountMinor`) are 64-bit `BIGINT`; JavaScript's safe-integer ceiling
  therefore applies (see "Money model").
- Whole transfer bundles can be edited in place (amount, rate, date, name, notes); changing the
  source/destination pair means deleting and re-creating the transfer, since the two-leg bundle
  must always stay consistent.
- Auth rate limiting is in-memory (per-instance). Acceptable for the single
  Render service in this topology; a shared store (e.g. Redis or Neon-backed)
  is the upgrade path if the service ever scales horizontally.
- The e2e server raises `RATE_LIMIT_AUTH_MAX` locally (the suite registers far
  more users than a real visitor; the production default is untouched).
- `postcss` is pinned via a root `package.json` override to a patched release:
  Next 15.x bundles a vulnerable copy and the upstream fix only ships in
  Next 16 (a breaking upgrade). Revisit the override when Next is upgraded.
- Semgrep was verified locally on Python 3.14 (pip-installed). Snyk requires
  a `SNYK_TOKEN` repo secret, so the workflow is verified by configuration
  review only — add the token and push to see it run.

## License

Proprietary. All rights reserved.