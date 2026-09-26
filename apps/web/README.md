# @moneypilot/web

The Money Pilot application: Next.js (App Router) UI and API route handlers in
one service, plus the finance domain services. See the
[root README](../../README.md) for the product overview, security model, and
[DESIGN.md](../../DESIGN.md) for the design system.

## Quick start

From the repo root:

```sh
npm install              # postinstall generates the SQLite Prisma client
cd apps/web
npm run db:dev           # creates prisma/dev.db and pushes the schema
cp .env.example .env     # set AUTH_JWT_SECRET (see the root README)
npm run dev              # http://localhost:3000
```

Local development runs against the generated SQLite twin — no PostgreSQL
needed. To develop against PostgreSQL instead, point `DATABASE_URL` at a
Postgres instance and run `npm run db:migrate` against the canonical schema.

## Scripts

| Script                       | What it does                                                  |
| ---------------------------- | ------------------------------------------------------------- |
| `npm run dev`                | `next dev` on :3000                                           |
| `npm run build`              | Production build (`next build`)                               |
| `npm run start`              | `next start` (production server; binds `$PORT`)                |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`                                        |
| `npm run db:dev`             | Generate the SQLite client + create/push `prisma/dev.db`       |
| `npm run db:schema:sqlite`   | Regenerate the SQLite twin (after every canonical schema change) |
| `npm run db:migrate`         | `prisma migrate dev` (PostgreSQL development migrations)       |
| `npm run db:deploy`          | `prisma migrate deploy` (production; Render runs this pre-deploy) |
| `npm run db:generate`        | Generate the canonical PostgreSQL client                       |
| `npm run db:studio`          | Prisma Studio                                                  |

## The two schemas

- `prisma/schema.prisma` — the **canonical** schema (PostgreSQL). The
  migrations under `prisma/migrations` are PostgreSQL-only and are what
  production runs (`prisma migrate deploy`; never `migrate dev` there).
- `prisma/schema.sqlite.prisma` — a **generated** twin (SQLite) for local dev
  and e2e. Never edit it by hand: change the canonical schema, then run
  `npm run db:schema:sqlite`. Generating it from the canonical schema is what
  keeps the two from drifting.

Client generation order matters: `postinstall` generates the SQLite client so
a fresh clone is instantly runnable; CI and the production build run
`npx prisma generate` (canonical client) before `next build`; the e2e server
flips the client back to SQLite before booting the app.

## Layout

```
src/
  app/                     App Router pages + API route handlers
    api/auth/…             login, register, refresh, logout(-all), devices,
                           verify-email, forgot/reset-password, me
    api/accounts|categories|transactions|transfers|
       budgets|debts|bills|dashboard/
                           finance endpoints (see the root README API table)
    api/admin/…            invitations + user list (ADMIN role only)
    api/users/…            data export, account deletion
    api/health             unauthenticated health probe (Render + e2e)
  lib/
    auth.ts, sessions.ts, tokens.ts, jwt.ts, password.ts, cookies.ts
                           session auth: bcrypt, 15-min HMAC access JWTs,
                           opaque rotating refresh tokens, __Host- cookies
    rateLimit.ts           in-memory per-IP auth rate limiting
    env.ts                 central env config + production guards
    api.ts                 route-handler helpers (ok/fail, zod validation,
                           request ids; errors never leak internals)
    finance/               domain services — every query is scoped to the
                           owning user, every write lands in the audit log:
                           accounts, transactions, transfers, budgets, debts,
                           bills, categories, dashboard, balances (derived,
                           never stored), dates
    audit.ts               audit-log writer
    mail.ts / email.ts     SMTP with console fallback
  components/              UI (finance managers, auth forms, nav, primitives)
  middleware.ts            auth gate + CSRF origin check + security headers
scripts/
  make-sqlite-schema.mjs    generates the SQLite twin
  check-prod-env.mjs        production env validation (Render pre-deploy)
  bootstrap-admin.mjs      idempotent first-admin bootstrap (private mode)
  e2e-server.mjs            disposable production server for the e2e suite
```

## Environment

All variables (with defaults) are documented in the
[root README](../../README.md#environment-variables) and `.env.example`.

## Testing

The Playwright suite in [`apps/e2e`](../e2e/README.md) boots this app in
production mode against a fresh SQLite database — run `npm run e2e` from the
repo root.

## Production

Deployed as a single Render service via the Blueprint in `render.yaml`
(pre-deploy: env check + `prisma migrate deploy`). Full guide:
[docs/deployment.md](../../docs/deployment.md).
