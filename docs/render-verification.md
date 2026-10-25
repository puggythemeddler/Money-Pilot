# Render deployment verification

Reviewed 2026-10-25. The supplied historical logs report a live service and
successful environment checks. The subsequent Prisma `kind: Closed` messages
are runtime database connection errors, not evidence of a build failure. Their
cause remains unconfirmed. `/api/health` does not query the database.

## Changes

- `apps/api/src/server.ts`: explicitly bind to `0.0.0.0`, retain injected PORT
  and local fallback 4000, and log the actual binding.
- `apps/api/scripts/check-prod-env.mjs`: stop echoing database URL prefixes
  in validation errors; malformed values can contain credentials.
- `docs/deployment.md`: correct the service root to the repository root.
- This report records deployment settings, checks, and remaining verification.

Existing package manifest and lockfile changes were left intact. Auth, cookies,
CSRF, the Vercel rewrite, and database schema/migrations were not changed.

Follow-up fixes: the audit gate now rejects npm error/incomplete reports and
has four regression tests run by CI. Node 24 is selected in `.nvmrc`, Render,
CI/Snyk, and the root manifest/lockfile. README and deployment instructions
reflect that requirement. API/shared Zod was upgraded to ^4.6.7 after the
network-enabled audit revealed a high-severity advisory against Zod 3.
The earlier dependency edits were preserved alongside that upgrade.

## Blueprint settings

Service: `moneypilot-api`; runtime: Node; plan: `free`; region: Frankfurt.
Root Directory: blank (repository root). Health path: `/api/health`.
Pre-deploy command: none (available only on paid Render services).

Build command, unchanged:

```sh
npm install --include=dev --workspace @moneypilot/shared --workspace @moneypilot/api && node scripts/check-migrations.mjs && cd apps/api && node scripts/check-prod-env.mjs && npx prisma generate && npx prisma migrate deploy && npm run build
```

Start command, unchanged:

```sh
node apps/api/scripts/check-prod-env.mjs && node apps/api/dist/server.js
```

Repository engines require Node >=24 and npm >=10; CI and Render select Node 24.
The API bundle retains its compatible Node 20 JavaScript target.
Local verification used Node 24.14.1. A successful local API build includes
TypeScript checking and produces `apps/api/dist/server.js`.

Required user-supplied Render variables:

| Variable | Value type |
| --- | --- |
| DATABASE_URL | Neon pooled PostgreSQL connection URL, including SSL options |
| DIRECT_DATABASE_URL | Neon direct PostgreSQL connection URL for the same database |
| AUTH_JWT_SECRET | Random secret, at least 32 characters |
| APP_BASE_URL | Public HTTPS origin of the Vercel web application |

The Blueprint also sets NODE_ENV=production, PRIVATE_MODE=false, and
AUTH_REFRESH_TTL_DAYS=30. Optional configuration in code includes
ALLOWED_ORIGINS, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SMTP_HOST, SMTP_PORT,
SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE, SEED_ADMIN_EMAIL,
SEED_ADMIN_PASSWORD, RATE_LIMIT_AUTH_MAX, and RATE_LIMIT_AUTH_WINDOW_SECONDS.
There is no GOOGLE_REDIRECT_URI setting. Free Render blocks standard SMTP
ports; SMTP configuration alone will not enable mail delivery there.

## Local checks

- API build/typecheck: passed; API lint: passed.
- API tests: 20 passed after moving TEMP/TMP into ignored node_modules cache;
  the first attempt failed with a Windows temp-cache rename EPERM.
- Migration encoding check: all four migrations passed.
- YAML parse: passed; Free plan and absent rootDir confirmed. This is syntax
  validation, not a live Render Blueprint validation.
- Environment guard: synthetic valid configuration passes; invalid database
  URL fails without printing the supplied value.
- Full repository build: API passed; frontend failed with Windows EPERM
  creating `apps/web/.next/server/app/dashboard/household/invite`.
- Tracked environment filenames include example files and source declarations,
  not actual .env secret files. This is not a historical secret audit.
- No dependency install was needed; existing node_modules were used.
- No database migration was executed against an unknown database.

Follow-up validation: all 120 API/shared tests were freshly rerun and passed
with Zod 4; repository typecheck and API build passed. All four audit regression
tests passed. The subsequent Hono update to ^4.13.14 resolves the remaining
moderate advisory. The live `npm audit --omit=dev --json` now reports zero
production dependency vulnerabilities at every severity. API build/typecheck,
all 20 API tests, and API lint were checked again after the Hono update.
The frontend production build passed outside the sandbox, establishing that
the repeated sandbox EPERM failures were environmental. No application build
workaround was introduced. In Vercel select Node.js 24.x before redeployment.

## Deployment and remaining verification

1. Review and commit the intended changes, then push your deployment branch.
2. In Render, sync the Blueprint; confirm Free compute, blank Root Directory,
   the build/start commands above, and no pre-deploy command.
3. Copy pooled and direct URLs from the same dedicated Neon test branch into
   the corresponding Render variables. Set the secret and Vercel HTTPS origin.
4. Deploy and inspect build logs for successful migration and API build. The
   Free build applies migrations before the new app starts; use test data.
5. Request the Render `/api/health` endpoint to verify HTTP startup.
6. In Vercel set Production MONEYPILOT_API_ORIGIN to
   `https://moneypilot-api-cnai.onrender.com` with no `/api` suffix, and redeploy
   if it changed. Keep DATABASE_URL and other backend secrets in Render.
7. Request `/api/health` through the Vercel origin. With a test account, sign
   in and save/read a transaction through the UI. Correlate any failure with
   Render logs. These database-backed operations establish whether the
   connection closures affect requests; the health route and Neon SQL Editor
   alone cannot establish that.

No private Render/Vercel configuration, current logs, or authenticated database
requests were available for verification. Do not assume a specific root cause
or add retries to writes based solely on `kind: Closed` messages.

Free compute is suitable for testing: it sleeps after 15 idle minutes, takes
about a minute to wake, and has resource limits. No paid resource was added.

References: https://render.com/docs/free and https://render.com/docs/deploys.
