# Deployment guide

MoneyPilot production topology:

```
GitHub ──► Render (Next.js: UI + API routes)
                 │
                 ▼
            Neon PostgreSQL
```

The full Next.js app (pages + API routes + services) runs as one service on
Render. The frontend and API are served by the same process, so there is no
CORS surface and cookies stay same-origin — no `NEXT_PUBLIC_API_URL`,
cross-domain cookie, or allow-list configuration is needed. Vercel is
deliberately not part of this topology: splitting the frontend onto a separate
origin would add cross-domain `__Host-` cookie and CORS complexity with no
benefit for this app. (If a split is ever needed, the UI already talks to the
API only through `apiFetch`, so the seam exists.)

## Environments

| Environment | Frontend/API            | Database                       |
| ----------- | ----------------------- | ------------------------------ |
| Development | `next dev` locally      | SQLite twin (`db:dev`) or a Neon branch |
| Staging     | Render service, or a Neon branch against the same code | Neon branch |
| Production  | Render (this blueprint) | Neon (main branch)             |

Never point a development or staging environment at the production database.
Neon's branching is the intended isolation mechanism: create a branch per
environment, and give each Render service its own `DATABASE_URL`.

## 1. Neon PostgreSQL

1. Create a project in [Neon](https://neon.tech). Choose the region closest to
   your Render service region.
2. Copy the **pooled** connection string (it is preconfigured with SSL):
   `postgresql://user:password@ep-…pooler.region.aws.neon.tech/neondb?sslmode=require`
3. That URL becomes `DATABASE_URL` on Render.

Neon guidance: use the pooled endpoint for the app (Render runs one persistent
Node process with a small Prisma connection pool). Migrations also run through
it in this setup; Neon's pooler handles `prisma migrate deploy` fine. If you
prefer the textbook setup (pooled runtime + direct migrations), add
`directUrl = env("DIRECT_DATABASE_URL")` to the `datasource db` block in
`prisma/schema.prisma` and set both variables — the schema intentionally ships
with a single URL to keep configuration minimal.

### Migrations — safety rules

- Production uses `prisma migrate deploy` only (run automatically by Render's
  pre-deploy step). **Never** run `prisma migrate dev`, `prisma db push`, or
  `prisma migrate reset` against production — they can rewrite/drop data.
- `prisma migrate deploy` is forward-only. To "roll back" a bad migration:
  fix forward with a new migration. Before risky deploys, create a Neon branch
  (see Backups below) so you can restore data if needed.
- The migration history is PostgreSQL-only (`migration_lock.toml` pins it).
  Local development and e2e tests use the generated SQLite twin
  (`prisma/schema.sqlite.prisma`) via `db push` — no migration history is
  needed locally.

## 2. Render

The repository ships a Render Blueprint: **`render.yaml`** at the repo root.

### Option A — Blueprint (recommended)

1. In Render, choose **New → Blueprint** and select this repository.
2. Render reads `render.yaml` and creates the `moneypilot` web service
   (Node runtime, root directory `apps/web`).
3. Set the secret environment variables when prompted (Blueprint marks them
   `sync: false`):

   | Variable          | Value                                                        |
   | ----------------- | ------------------------------------------------------------ |
   | `DATABASE_URL`    | Neon pooled connection string (from step 1)                 |
   | `AUTH_JWT_SECRET` | 48 random bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `APP_BASE_URL`    | Your service URL, e.g. `https://moneypilot.onrender.com` (update after the first deploy if you use a custom domain) |

4. Deploy. The pre-deploy step (`node scripts/check-prod-env.mjs &&
   npx prisma migrate deploy`) fails fast with a clear message if a required
   variable is missing or malformed, then applies migrations.

### Option B — Manual service

- **Type**: Web Service, Node, root directory `apps/web`
  (Render installs workspace dependencies from the repo-root lockfile).
- **Build command**: `npx prisma generate && npm run build`
- **Start command**: `npx next start -p $PORT`
- **Pre-deploy command**: `node scripts/check-prod-env.mjs && npx prisma migrate deploy`
- **Health check path**: `/api/health`
- Same environment variables as above (`NODE_ENV=production` is Render's default).

### What each step does

- `npx prisma generate` — builds the Prisma client from the **canonical
  PostgreSQL schema**. (The install step's postinstall generates the SQLite
  dev client; this build step switches to the production client.)
- `npm run build` — `next build`.
- Pre-deploy — validates the environment, then applies PostgreSQL migrations
  with `prisma migrate deploy`.
- `npx next start -p $PORT` — binds to the port Render provides (never a
  hardcoded port).

## 3. Post-deployment smoke test

- [ ] `GET https://<your-service>/api/health` returns `{"status":"ok",…}` (no auth, no secrets).
- [ ] The landing/login pages load (assets, CSS) over https.
- [ ] Register a throwaway account; login/logout works.
- [ ] Unauthenticated `GET /api/accounts` returns 401.
- [ ] A second user cannot read the first user's records (cross-user ID → 404).
- [ ] Create an account + transaction; the dashboard reflects it (writes work).
- [ ] `GET /api/dashboard` reflects balances (reads + derived data work).
- Cookies are `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax`.

## 4. Backups and recovery

- **Neon is responsible for platform durability, you are responsible for
  your data**: Neon keeps a point-in-time restore (PITR) window (plan
  dependent, e.g. 7 days on the free plan) and full history on branches that
  are not deleted.
- **Before every risky migration or bulk change**: create a Neon branch
  (`neon branches create --name pre-deploy-YYYYMMDD`) or take a logical dump
  with `pg_dump`. Neon branches are cheap and instant.
- **Restore procedure**: branch/restore to a point in time in the Neon
  console → verify on a staging service pointed at the restored branch →
  then repoint production `DATABASE_URL` at the restored branch (or dump/restore
  into the main branch).
- **Rollback limitations**: schema migrations are forward-only; the
  application is rolled back by re-deploying the previous commit in Render
  ("Manual Deploy → Deploy specific commit"). Data written by a newer version
  is not automatically reverted — restore from the pre-deploy branch if needed.
- **Never test recovery procedures against the production branch** — rehearse
  on a staging branch/service first.

## 5. Custom domains

- Add a custom domain in Render (e.g. `app.moneypilot.example`); Render
  provisions TLS. Then update `APP_BASE_URL` to `https://app.moneypilot.example`.
- No code changes are required: the app derives links and origin checks from
  `APP_BASE_URL`.

## 6. Observability

- Render service logs stream stdout/stderr (request logs, migration output,
  pre-deploy check results).
- Application errors are logged server-side only — client-facing responses
  never include stack traces, SQL, connection strings, or secrets.
- Failed authentication attempts, admin actions, and every financial write are
  recorded in the `audit_logs` table with actor, action, entity, and metadata.
- Neon provides query/connection metrics in its console.
