# MoneyPilot API (`@moneypilot/api`)

Standalone MoneyPilot backend: a [Hono](https://hono.dev) application served
by `@hono/node-server` that owns the database (Prisma), authentication,
finance and household services, and the audit trail.

- **Runtime**: Node.js >= 20, TypeScript, Hono + @hono/node-server.
- **Build**: `tsc --noEmit` for type safety, then a single-file esbuild
  bundle (`dist/server.js`); `@prisma/client`, Hono, jose, bcryptjs and zod
  stay external and resolve from `node_modules` at runtime.
- **Database**: PostgreSQL in production (Render + Neon, `prisma migrate
  deploy`), a generated SQLite twin for local development and e2e (`prisma/
  schema.sqlite.prisma`).

## Routes

Every endpoint lives under `/api` and speaks the shared JSON envelope
(`{ data }` on success, `{ error: { code, message, requestId } }` on failure):

- `GET  /api/health` — liveness probe.
- `POST /api/auth/register|login|refresh|logout|logout-all`
- `GET|PATCH /api/auth/me`, `POST /api/auth/forgot-password|reset-password|
  verify-email|resend-verification`, `GET|POST /api/auth/devices`
- `GET|POST /api/accounts`, `GET|PATCH /api/accounts/:id`
- `GET|POST /api/transactions`, `PATCH|DELETE /api/transactions/:id`
- `GET|POST /api/transfers`, `PATCH|DELETE /api/transfers/:id`
- `GET|POST /api/categories`, `PATCH /api/categories/:id`
- `GET|POST /api/budgets`, `PATCH /api/budgets/:id`
- `GET|POST /api/debts`, `PATCH /api/debts/:id`
- `GET|POST /api/bills`, `PATCH|POST /api/bills/:id` (POST pays the bill)
- `GET /api/dashboard`
- `GET|POST|PATCH|DELETE /api/household`, `GET /api/household/overview`,
  `POST /api/household/accounts`, `PATCH /api/household/accounts/:id`,
  `GET|POST /api/household/invites`, `POST /api/household/invites/accept`,
  `DELETE /api/household/invites/:id`, `PATCH|DELETE /api/household/members/:id`
- `GET /api/admin/users`, `GET|POST /api/admin/invitations`,
  `DELETE /api/admin/invitations/:id`
- `GET /api/users/export`, `POST /api/users/delete-account`

## Local development

```bash
# from the repository root (npm workspaces):
npm install
npm run dev --workspace @moneypilot/api   # tsx watch on http://localhost:4000
```

Copy `.env.example` to `.env` (SQLite default needs no configuration). The
web app in `apps/web` proxies its `/api/*` requests to this server — see
`apps/web/README.md` for the proxy setup.

## Security model (unchanged from the integrated app)

- Auth cookies are `__Host-` prefixed, HttpOnly, SameSite=Lax, Path=/ — set
  through the web app's same-origin proxy so browsers store them on the web
  origin.
- CSRF: unsafe methods must originate from the request's own authority
  (Host / X-Forwarded-Host), the web app's public URL (`APP_BASE_URL`), or an
  explicitly allowed origin (`ALLOWED_ORIGINS`, comma separated). No CORS
  headers are ever emitted.
- Access tokens are 15-minute HMAC JWT handles to server-side sessions;
  refresh tokens are opaque, hashed at rest, and rotate atomically with
  lineage revocation on reuse.
- Rate limiting on auth endpoints is in-memory and per-instance.

## Deployment (Render)

Render runs `node dist/server.js` behind TLS with `PORT` injected; see
`render.yaml` at the repository root and the full split-deployment guide in
[docs/deployment.md](../../docs/deployment.md). Required env:
`DATABASE_URL` (Neon), `AUTH_JWT_SECRET`, `APP_BASE_URL` (the **web app's**
https URL — Vercel). Optional: `ALLOWED_ORIGINS` (extra accepted origins,
comma separated), `PRIVATE_MODE`, `AUTH_REFRESH_TTL_DAYS`, `SMTP_*`.
