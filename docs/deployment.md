# Deployment guide

MoneyPilot production topology:

```
                ┌─► Vercel (apps/web — frontend-only Next.js)
GitHub ──────────┤
                └─► Render (apps/api — Hono backend) ──► Neon PostgreSQL
                          ▲
                          └── /api/* proxied, same-origin, by the web app
```

The web app is frontend-only: `next.config.ts` proxies every `/api/*` request
to the API service (`MONEYPILOT_API_ORIGIN`). Browsers only ever talk to the
web origin — no CORS headers, no cross-domain cookies: the `__Host-` auth
cookies are set through the proxy and land on the web origin. The API enforces
CSRF itself (the browser's `Origin` — the web origin — is accepted via
`APP_BASE_URL`).

Both services deploy from the same repository:

| Service | Platform | Root directory | Serves |
| ------- | -------- | -------------- | ------ |
| Web app | Vercel | `apps/web` | The UI; `/api/*` proxied to Render |
| API | Render (this blueprint: `render.yaml`) | `apps/api` | All business logic, auth, database access |
| Database | Neon | — | PostgreSQL |

## Environments

| Environment | Web app                     | API                          | Database                       |
| ----------- | ---------------------------- | ---------------------------- | ------------------------------ |
| Development | `next dev` on :3000          | `tsx watch` on :4000         | SQLite twin (`db:dev`) or a Neon branch |
| Staging     | Vercel preview deployment   | Render service (or branch deploy) | Neon branch |
| Production  | Vercel (production)         | Render (this blueprint)      | Neon (main branch)             |

Never point a development or staging environment at the production database.
Neon's branching is the intended isolation mechanism: create a branch per
environment, and give each API deployment its own `DATABASE_URL`.

## 1. Neon PostgreSQL

1. Create a project in [Neon](https://neon.tech). Choose the region closest to
   your services (Vercel functions run where your users are; put the Render
   service in the same Neon region).
2. Copy the **pooled** connection string (it is preconfigured with SSL):
   `postgresql://user:password@ep-…pooler.region.aws.neon.tech/neondb?sslmode=require`
3. That URL becomes `DATABASE_URL` on Render.

Neon guidance: use the pooled endpoint for the app (the API runs one
persistent Node process with a small Prisma connection pool). Migrations also
run through it in this setup; Neon's pooler handles `prisma migrate deploy`
fine. If you prefer the textbook setup (pooled runtime + direct migrations),
add `directUrl = env("DIRECT_DATABASE_URL")` to the `datasource db` block in
`apps/api/prisma/schema.prisma` and set both variables — the schema
intentionally ships with a single URL to keep configuration minimal.

### Migrations — safety rules

- Production uses `prisma migrate deploy` only (run automatically in Render's
  build step). **Never** run `prisma migrate dev`, `prisma db push`, or
  `prisma migrate reset` against production — they can rewrite/drop data.
- `prisma migrate deploy` is forward-only. To "roll back" a bad migration:
  fix forward with a new migration. Before risky deploys, create a Neon branch
  (see Backups below) so you can restore data if needed.
- The migration history is PostgreSQL-only (`migration_lock.toml` pins it).
  Local development and e2e tests use the generated SQLite twin
  (`apps/api/prisma/schema.sqlite.prisma`) via `db push` — no migration
  history is needed locally.

## 2. Deploy order (the URLs depend on each other)

The two services reference each other's URLs, so create both first, then set
the final environment variables, then deploy:

1. The **web app's** URL (`https://<project>.vercel.app`) becomes
   `APP_BASE_URL` on Render.
2. The **API's** URL (`https://<render-service>.onrender.com`) becomes
   `MONEYPILOT_API_ORIGIN` on Vercel.

Both URLs are known as soon as the projects exist (a Render blueprint names
the service `moneypilot-api`; a Vercel project's URL is shown in its
dashboard), so the recommended order is: **create both projects with their
environment variables set in one sitting, then deploy.**

## 3. Render — the API service

The repository ships a Render Blueprint: **`render.yaml`** at the repo root.

### Option A — Blueprint (recommended)

1. In Render, choose **New → Blueprint** and select this repository.
2. Render reads `render.yaml` and creates the `moneypilot-api` web service
   (Node runtime). The service root is the **repository root** — this is an
   npm workspaces monorepo, so `npm install` must run where the root
   `package.json`, `package-lock.json` and `packages/shared` live for
   `@moneypilot/shared` to resolve. The install/build/start/pre-deploy
   commands reference `apps/api` by path (see the Blueprint).
3. Set the secret environment variables when prompted (Blueprint marks them
   `sync: false`):

   | Variable          | Value                                                        |
   | ----------------- | ------------------------------------------------------------ |
   | `DATABASE_URL`    | Neon pooled connection string (from step 1)                 |
   | `AUTH_JWT_SECRET` | 48 random bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `APP_BASE_URL`    | The **web app's** https URL, e.g. `https://moneypilot.vercel.app` (update whenever the web URL changes, e.g. a custom domain) |

   Optional: `ALLOWED_ORIGINS` (extra accepted origins, comma separated),
   `PRIVATE_MODE=true` (invite-only registration), `AUTH_REFRESH_TTL_DAYS`,
   and the `SMTP_*` variables once a mailer provider is configured.

   **"Continue with Google" (optional)** — set `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` on the API service to enable Google sign-in:

   1. In the [Google Cloud Console](https://console.cloud.google.com/) create
      (or pick) a project, then go to **APIs & Services → Credentials →
      Create Credentials → OAuth client ID → Web application**.
   2. Add an **Authorized redirect URI**:
      `https://<your-web-app-url>/api/auth/google/callback` (the **web app's**
      URL — the OAuth redirect lands on the web origin and is proxied to the
      API like every other `/api/*` request).
   3. Copy the client ID and secret into the two `GOOGLE_*` variables on
      Render.

   Without them the Google endpoints redirect back with a clear "not
   configured" error and everything else works unchanged.

4. Deploy. **Render Free does not support pre-deploy commands**, so the
   build pipeline runs the checks instead: it validates the environment
   (`node apps/api/scripts/check-prod-env.mjs`), regenerates the Prisma
   client, applies migrations (`npx prisma migrate deploy`), then builds.
   The start command re-runs the env check as a guard. The service binds
   the port Render injects (`PORT`) and the health check polls
   `/api/health`.

### Option B — Manual service

- **Type**: Web Service, Node. Leave **Root Directory empty** (the repository
  root): `npm install` must run where the root `package.json` +
  `package-lock.json` live so the `@moneypilot/shared` workspace resolves.
- **Build command**: `npm install --workspace @moneypilot/shared --workspace @moneypilot/api && cd apps/api && node scripts/check-prod-env.mjs && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start command**: `node apps/api/scripts/check-prod-env.mjs && node apps/api/dist/server.js`
- **Health check path**: `/api/health`
- Same environment variables as above (`NODE_ENV=production` is Render's default).

### What each step does

- `npx prisma generate` — builds the Prisma client from the **canonical
  PostgreSQL schema**. (The install step's postinstall generates the SQLite
  dev client; this build step switches to the production client.)
- `npx prisma migrate deploy` — applies the committed PostgreSQL migrations
  to Neon. It runs in the build step because Render Free has no pre-deploy
  hook; the migrations are forward-only and safe to run on every build.
- `npm run build` — run inside `apps/api`; `tsc --noEmit` (type safety), then
  the esbuild bundle `dist/server.js` (Prisma client, Hono, jose, bcryptjs,
  zod stay external).
- `node apps/api/dist/server.js` — binds the port Render provides (never a
  hardcoded port); the env-check guard ahead of it fails startup fast with a
  clear message if `DATABASE_URL`, `AUTH_JWT_SECRET` or `APP_BASE_URL` is
  missing or malformed in production.

## 4. Vercel — the web app

1. In Vercel, **Add New → Project** and import this repository.
2. **Root Directory**: `apps/web` (Vercel installs workspace dependencies
   from the repository root automatically; no build overrides are needed —
   Next.js is detected).
3. Environment variable (Production and Preview):

   | Variable                | Value                                            |
   | ----------------------- | ------------------------------------------------ |
   | `MONEYPILOT_API_ORIGIN` | The API's https URL, e.g. `https://moneypilot-api.onrender.com` |

   Set it **before the first deployment** — Vercel evaluates `next.config.ts`
   at build time, and the `/api/*` proxy destination is baked into the
   deployment.
4. Deploy.

Notes:

- The proxy is a **server-side** rewrite: the browser only ever sees
  same-origin `/api/*` requests on the web origin. Auth cookies set by the
  API through the proxy (`__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`,
  `Path=/`) land on the web origin, so no CORS or cross-domain cookie
  configuration exists at all.
- The API's CSRF check accepts the web origin via `APP_BASE_URL` (Render).
  When you add a custom domain later, update `APP_BASE_URL` (and optionally
  list both URLs in `ALLOWED_ORIGINS` during the transition).

## 5. Post-deployment smoke test

Run against the **web app's** URL (through the proxy — this proves the whole
chain):

- [ ] `GET https://<web-url>/api/health` returns `{"status":"ok",…}` (no auth, no secrets).
- [ ] The landing/login pages load (assets, CSS) over https.
- [ ] Register a throwaway account; login/logout works (cookies set through
      the proxy).
- [ ] Unauthenticated `GET /api/accounts` returns 401.
- [ ] A second user cannot read the first user's records (cross-user ID → 404).
- [ ] Create an account + transaction; the dashboard reflects it (writes work).
- [ ] `GET /api/dashboard` reflects balances (reads + derived data work).
- [ ] Cookies are `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] (Optional, direct) `GET https://<api-url>/api/health` also returns ok.

## 6. Backups and recovery

- **Neon is responsible for platform durability, you are responsible for
  your data**: Neon keeps a point-in-time restore (PITR) window (plan
  dependent, e.g. 7 days on the free plan) and full history on branches that
  are not deleted.
- **Before every risky migration or bulk change**: create a Neon branch
  (`neon branches create --name pre-deploy-YYYYMMDD`) or take a logical dump
  with `pg_dump`. Neon branches are cheap and instant.
- **Restore procedure**: branch/restore to a point in time in the Neon
  console → verify on a staging API deployment pointed at the restored
  branch → then repoint production `DATABASE_URL` at the restored branch (or
  dump/restore into the main branch).
- **Rollback limitations**: schema migrations are forward-only; the API is
  rolled back by re-deploying the previous commit in Render ("Manual Deploy →
  Deploy specific commit"), the web app by redeploying the previous
  deployment in Vercel. Data written by a newer version is not automatically
  reverted — restore from the pre-deploy branch if needed.
- **Never test recovery procedures against the production branch** — rehearse
  on a staging branch/service first.

## 7. Custom domains

- Add the custom domain in **Vercel** (e.g. `app.moneypilot.example`); Vercel
  provisions TLS.
- Then update the API's `APP_BASE_URL` on Render to
  `https://app.moneypilot.example` (email links + the CSRF origin check).
  During a transition period where both URLs are live, list both in
  `ALLOWED_ORIGINS` (comma separated).
- No code changes are required: the app derives links and origin checks from
  `APP_BASE_URL`.

## 8. Observability

- Render service logs stream stdout/stderr (request logs, migration output,
  pre-deploy check results); Vercel logs the web app's server output
  (including proxy errors if the API is unreachable).
- Application errors are logged server-side only — client-facing responses
  never include stack traces, SQL, connection strings, or secrets.
- Failed authentication attempts, admin actions, and every financial write are
  recorded in the `audit_logs` table with actor, action, entity, and metadata.
- Neon provides query/connection metrics in its console.
