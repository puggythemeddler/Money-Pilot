# @moneypilot/web

The Money Pilot web app: a frontend-only Next.js (App Router) application.
All data comes from the standalone MoneyPilot API ([`apps/api`](../api/README.md)):
client components call the same-origin `/api/*` proxy through `api-client.ts`,
server components fetch the API directly through `lib/server-api.ts`
(forwarding the incoming auth cookies). `next.config.ts` proxies every
`/api/*` request to `MONEYPILOT_API_ORIGIN` — same-origin for the browser,
so auth cookies never need CORS and the API enforces CSRF itself. See the
[root README](../../README.md) for the product overview and security model,
and [DESIGN.md](../../DESIGN.md) for the design system.

## Quick start

From the repo root (the API must be running on :4000 — see
[`apps/api/README.md`](../api/README.md)):

```sh
npm install
cd apps/web
cp .env.example .env     # MONEYPILOT_API_ORIGIN (defaults to http://localhost:4000)
npm run dev              # http://localhost:3000
```

## Scripts

| Script                       | What it does                       |
| ---------------------------- | ---------------------------------- |
| `npm run dev`                | `next dev` on :3000                |
| `npm run build`              | Production build (`next build`)    |
| `npm run start`              | `next start` (binds `$PORT`)       |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`            |

## Layout

```
src/
  app/                     App Router pages ((auth) flows + dashboard)
  lib/
    api-client.ts          client-side same-origin /api/* fetch wrapper
    server-api.ts          serverFetch: server components call the API with
                           the incoming request's cookies (401 → /login at
                           the call sites); ServerApiError keeps the shared
                           error contract (code, status, requestId)
    device-key.ts          per-device client key material (device names)
    cn.ts                  className helper
  components/              UI (finance managers, household manager + invite
                           accept, auth forms, nav, primitives)
  middleware.ts            CSRF origin check + security headers (defense in
                           depth: the API re-checks Origin itself)
next.config.ts             /api/* → MONEYPILOT_API_ORIGIN proxy rewrites
```

## Environment

| Variable                | Meaning                             | Default                  |
| ----------------------- | ----------------------------------- | ------------------------ |
| `MONEYPILOT_API_ORIGIN` | API origin `/api/*` is proxied to   | `http://localhost:4000` |

## Testing

The Playwright suite in [`apps/e2e`](../e2e/README.md) boots this app plus a
fresh instance of the API and runs the critical user paths through the proxy —
run `npm run e2e` from the repo root.

## Production

Deployed to Vercel (frontend-only): set `MONEYPILOT_API_ORIGIN` to the API
service's https origin so `/api/*` proxies to it. The API service contract
and its deployment are documented in [`apps/api/README.md`](../api/README.md)
and [docs/deployment.md](../../docs/deployment.md).
