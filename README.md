# Money Pilot

Money Pilot is a privacy-first personal finance platform built for Kenyan users (KES-first)
and designed to work anywhere. It runs as a web app now, with a companion Android/iOS app
planned for a later phase.

Everything you record stays yours. The product deliberately avoids unsolicited monetization:
no ads, no data brokerage, no financial product upsells. It only spends from an optional
monthly core budget you choose explicitly.

> Status: **Phase 2 — financial engine.** Authentication, invite-only mode, admin foundation,
> data export / account deletion, accounts, categories, transactions, income/expenses and
> transfers are implemented and end-to-end tested. Budgets, debts and reports land later.

## Stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Framework  | Next.js (App Router) + React 19, TypeScript                       |
| API        | Route handlers under `apps/web/src/app/api`                       |
| Database   | Prisma 6 + SQLite (local development) / PostgreSQL (production)    |
| Auth       | bcrypt (12 rounds), 15-minute HMAC access JWTs, opaque rotating refresh tokens |
| Validation | Zod schemas in `packages/shared`                                  |
| Styling    | Tailwind CSS v4                                                   |
| Monorepo   | Turborepo; `apps/web` (app) and `packages/shared` (shared code)   |

## Money model

Monetary values are **integer minor units** — never floats. A user-entered decimal amount is
converted exactly once at the API boundary by `parseMoneyToMinorUnits` in
`packages/shared/src/money.ts` (BigInt-based, supports exponents, deterministic rounding).
Formatting back to a currency string uses `formatMoney`.

- `Transaction.amountMinor` is *signed*: expenses are negative, income is positive, transfer
  legs are `−amount` (out) and `+amount` (in). The sign is your balance ledger.
- Stored as a 32-bit integer field: column values are clamped to the signed 32-bit range
  (±2,147,483,647 minor units). MoneyPilot documents this ceiling; multi-billion-unit entries
  are not supported.
- **Balances are derived, never stored.** An account's balance is its opening balance plus the
  sum of all *open* (non-deleted) transactions. Deleting or editing a transaction changes the
  balance automatically and consistently.
- Transfers are atomic: one `Transfer` row plus two linked `Transaction` legs written in a
  single database transaction. Deleting a transfer soft-deletes the bundle so money never
  appears or disappears mid-way.
- Accounts and categories are archive-only; transactions and transfers are soft-deleted,
  so history (and audit) is never destroyed.

### Limits and semantics

- Transfers are same-currency only; cross-currency movements are out of scope.
- Insufficient-balance is intentionally NOT enforced — credit accounts and overdrafts are
  legitimate, so balance is allowed to go negative.
- Category `kind` must match the transaction kind (an expense cannot use an income category).
- Archived accounts and categories can't receive new entries but stay visible with history.

## Repository layout

```
apps/web          Next.js application (UI + API routes)
  src/lib/finance     Financial domain services (ownership + audit on every write)
  src/app/api/finance   API routes: accounts, categories, transactions, transfers, dashboard
packages/shared   Shared domain rules: money (minor units), currency, zod schemas, error contract
```

## Getting started

Requirements: Node.js 20+ (developed on 24), npm.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Prepare the local database:

   ```sh
   cd apps/web
   npx prisma migrate dev
   ```

3. Configure environment variables:

   ```sh
   cp apps/web/.env.example apps/web/.env
   ```

   At minimum set `AUTH_JWT_SECRET` to a strong random value:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. Start the development server:

   ```sh
   npm run dev        # from the repo root
   ```

   Open http://localhost:3000.

## Environment variables

All live under `apps/web/.env` (see `apps/web/.env.example`).

| Variable                       | Meaning                                                        | Default            |
| ------------------------------ | -------------------------------------------------------------- | ------------------ |
| `DATABASE_URL`                 | Prisma database URL (`file:./dev.db` for SQLite)               | —                  |
| `APP_BASE_URL`                 | Public base URL used to build email links and validate origins | `http://localhost:3000` |
| `AUTH_JWT_SECRET`              | HMAC secret for access tokens (48+ random bytes recommended)   | —                  |
| `AUTH_REFRESH_TTL_DAYS`        | Refresh-token lifetime in days                                 | `30`               |
| `PRIVATE_MODE`                 | `true` = invite-only registration                              | `false`            |
| `SEED_ADMIN_EMAIL`             | Bootstrap admin email (read by the bootstrap script)           | —                  |
| `SEED_ADMIN_PASSWORD`          | Password for the bootstrap admin account                       | —                  |
| `RATE_LIMIT_AUTH_MAX`          | Auth request cap per IP per window                             | `50`               |
| `RATE_LIMIT_AUTH_WINDOW_SECONDS` | Auth rate-limit window                                          | `60`               |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | SMTP for email delivery; falls back to console | — |

In invite-only mode (`PRIVATE_MODE=true`) no one can register without an invitation, so a
private deployment needs a first administrator. Bootstrap it once as a separate step:

```sh
cd apps/web
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
- **CSRF**: unsafe cross-origin POST/PUT/PATCH/DELETE requests are rejected unless the Origin
  matches. Security headers (X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
  Permissions-Policy) are set on every response.
- **Roles & lifecycle**: admin routes require the `ADMIN` role; deleted/disabled accounts cannot
  authenticate. Invitation tokens are stored only as digests and are single-use.
- Account deletion anonymizes personal information, revokes every session, and hard-stops
  authentication while retaining audit rows for compliance.
- Auth endpoints are rate-limited per IP. `assertProdConfig` refuses to run on production
  builds unless served over https or loopback http.

## Data privacy

- **Export** — `GET /api/users/export` returns a JSON bundle of everything the account has,
  including accounts, categories, transactions and transfers. Tokens, sessions, and password
  hashes are never exported.
- **Delete account** — `POST /api/users/delete-account` requires the current password and the
  literal confirmation `DELETE`. It signs the user out everywhere and anonymizes the account.

## API

Everything under `/api/finance` requires an authenticated session. Money amounts accept a
decimal number or string and are always validated with the shared Zod schemas.

| Route                          | Methods            | Description                               |
| ------------------------------ | ------------------ | ----------------------------------------- |
| `/api/accounts`                | `GET`, `POST`      | List (balances derived), create account   |
| `/api/accounts/:id`            | `GET`, `PATCH`     | Account detail, update/archive            |
| `/api/categories`              | `GET`, `POST`      | List (with transaction counts), create    |
| `/api/categories/:id`          | `PATCH`            | Update/archive                            |
| `/api/transactions`            | `GET`, `POST`      | List with filters (`kind`,`account`,`category`,`from`,`to`,`q`), create |
| `/api/transactions/:id`        | `PATCH`, `DELETE`  | Update, soft-delete (deletes transfer bundle) |
| `/api/transfers`               | `GET`, `POST`      | List, create (atomic two-leg transfer)    |
| `/api/transfers/:id`           | `DELETE`           | Soft-delete transfer + both legs          |
| `/api/dashboard`               | `GET`              | Overview summary for the dashboard        |

Every write is recorded in the audit log with the acting user, entity and context. All queries
are scoped to the authenticated user — cross-user access returns 404.

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
npm run dev           # development servers
npm run build         # production build (all workspaces)
npm run test          # unit tests (packages/shared)
npm run lint          # eslint (all workspaces)
npm run typecheck     # TypeScript checks (all workspaces)
```

## Verification checklist

Each phase is finished only when the following all pass:

- [x] Unit tests (`packages/shared`) — 52 tests, exact money parsing & schemas
- [x] TypeScript (`npm run typecheck`)
- [x] ESLint (`npm run lint`)
- [x] Production build (`npm run build`)
- [x] API/DB consistency (Prisma migrations: `init`, `add_roles_and_invitations`, `finance_accounts`)
- [x] End-to-end smoke — public + private-mode auth scenarios, plus a 55-assertion finance suite
      (accounts, categories, transactions, transfers, dashboard, cross-user isolation, UI renders)
- [x] Responsive UI review (no dead links or buttons)

## Roadmap

1. **Foundation** *(done)* — repo, architecture, database, auth, user model, design system,
   env config, private mode, admin, data privacy, docs.
2. **Financial engine** *(current)* — accounts, transactions, categories, income, expenses,
   transfers. *Done: modeling, services, API, UI, tests.* Budgets, debts and bills still to come
   in the same engine.
3. **Budgets & goals** — monthly budgets, savings/spending goals, rollovers.
4. **Debts & investments** — debt entries, installments, payoff plans, tracking (not trading).
5. **Reports & insights** — analytics, charts, exports.
6. **Mobile apps** — Android/iOS companion clients.
7. **Hardening & subscriptions** — optional paid tiers for hosting/storage only.

Out of scope by design: cryptocurrency, securities trading, an insurance marketplace,
third-party payment processing, social networking, and an unsolicited advisory engine.

## Known limitations

- Email is printed to the server console when no SMTP is configured.
- SQLite is for local development; use PostgreSQL for production.
- Cell values (including `amountMinor`) are limited to the signed 32-bit integer range; very
  large amounts in hundreds of millions of units are not supported.
- Editing and deleting whole standalone transactions is available; editing transfer legs
  individually is deliberately disallowed to keep the two-leg bundle consistent.
- Cross-currency transfers and exchange-rate handling are out of scope for Phase 2.

## License

Proprietary. All rights reserved.