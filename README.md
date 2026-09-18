# Money Pilot

Money Pilot is a privacy-first personal finance platform built for Kenyan users (KES-first)
and designed to work anywhere. It runs as a web app now, with a companion Android/iOS app
planned for a later phase.

Everything you record stays yours. The product deliberately avoids unsolicited monetization:
no ads, no data brokerage, no financial product upsells. It only spends from an optional
monthly core budget you choose explicitly.

> Status: **Phase 1 — application foundation.** Authentication, invite-only mode, admin
> foundation, and data export / account deletion are implemented and end-to-end tested.
> Money features arrive in Phase 2.

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

Money is always stored as integer minor units (e.g. `1500` cents) with linked currency codes —
never floating point. Timestamps are stored in UTC and rendered in the user's timezone.

## Repository layout

```
apps/web          Next.js application (UI + API routes)
packages/shared   Shared domain rules: money, currency, zod schemas, error contract
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
| `APP_BASE_URL`                 | Public base URL used to build email links                      | `http://localhost:3000` |
| `AUTH_JWT_SECRET`              | HMAC secret for access tokens (48+ random bytes recommended)   | —                  |
| `AUTH_REFRESH_TTL_DAYS`        | Refresh-token lifetime in days                                 | `30`               |
| `PRIVATE_MODE`                 | `true` = invite-only registration                              | `false`            |
| `SEED_ADMIN_EMAIL`             | Optional bootstrap admin email (created on first login attempt)| —                  |
| `SEED_ADMIN_PASSWORD`          | Password for the bootstrap admin account                       | —                  |
| `RATE_LIMIT_AUTH_MAX`          | Auth request cap per IP per window                             | `50`               |
| `RATE_LIMIT_AUTH_WINDOW_SECONDS` | Auth rate-limit window                                          | `60`               |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | SMTP for email delivery; falls back to console | — |

In invite-only mode (`PRIVATE_MODE=true`) no one can register without an invitation, so a
private deployment needs a first administrator. Set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`, then sign in once — the account is created idempotently and never
resets an existing account. The admin can then create invitations (see below).

## Security model

- Passwords hashed with bcrypt (12 rounds); policy: 8–72 characters, must contain a letter and a digit.
- Access tokens: short-lived (15 min) HMAC-signed JWTs, bearer or cookie.
- Refresh tokens: opaque, stored only as SHA-256 digests, rotated on every refresh.
  Using an already-rotated token revokes the whole session chain.
- Email/password verification and password-reset tokens are single-use and time-limited.
- Admin routes require the `ADMIN` role; deleted/disabled accounts cannot authenticate.
- Invitation tokens are stored only as digests and are single-use.
- Account deletion anonymizes personal information, revokes every session, and hard-stops
  authentication while retaining audit rows for compliance.
- Auth endpoints are rate-limited per IP.

## Data privacy

- **Export** — `GET /api/users/export` returns a JSON bundle of everything the account has
  (currently profile + device metadata; financial entities join automatically in later phases).
  Tokens, sessions, and password hashes are never exported.
- **Delete account** — `POST /api/users/delete-account` requires the current password and the
  literal confirmation `DELETE`. It signs the user out everywhere and anonymizes the account.

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

- [x] Unit tests (`packages/shared`)
- [x] TypeScript (`npm run typecheck`)
- [x] ESLint (`npm run lint`)
- [x] Production build (`npm run build`)
- [x] API/DB consistency (Prisma migrations)
- [x] End-to-end smoke (public + private-mode scenarios)
- [x] Responsive UI review (no dead links or buttons)

## Roadmap

1. **Foundation** *(current)* — repo, architecture, database, auth, user model,
   design system, env config, private mode, admin foundation, data privacy, docs.
2. **Financial engine** — accounts, transactions, categories, income, expenses, transfers.
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
- Phase 1 stores no financial data yet; the export bundle will grow with each phase.

## License

Proprietary. All rights reserved.