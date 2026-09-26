// Boots a disposable production environment for the Playwright suite: the
// MoneyPilot API (`apps/api`, Hono + a fresh SQLite database, default port
// 4000) plus the frontend-only web app (`apps/web`, `next start` on E2E_PORT,
// default 3105) proxying /api/* to the API through next.config.ts rewrites.
// Both apps are rebuilt every run so a stale build can never serve outdated
// routes. The health poll (Playwright webServer.url) goes through the web
// proxy — http://localhost:3105/api/health — which proves the whole chain.
import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const e2eRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(e2eRoot, "..", "api");
const web = path.join(e2eRoot, "..", "web");
const port = Number(process.env.E2E_PORT || 3105);
const apiPort = Number(process.env.E2E_API_PORT || 4000);
// `localhost` (not 127.0.0.1): Playwright's request context exempts only
// localhost from the "no Secure cookies over http" rule, and the app's
// session cookies are __Host- (Secure).
const base = `http://localhost:${port}`;
const apiBase = `http://localhost:${apiPort}`;
const dbUrl = process.env.E2E_DB_URL || "file:./e2e-playwright.db";
const dbFile = path.join(api, "prisma", dbUrl.replace("file:", ""));

await rm(dbFile, { force: true }).catch(() => {});
await rm(`${dbFile}-journal`, { force: true }).catch(() => {});
await mkdir(path.dirname(dbFile), { recursive: true }).catch(() => {});

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// Fresh SQLite database + the SQLite Prisma client in apps/api: a prior
// `prisma generate` (PostgreSQL, used for the production build) would
// otherwise leave the wrong client in place for the e2e runtime.
execSync(`${npx} prisma db push --schema prisma/schema.sqlite.prisma`, {
  cwd: api,
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: "inherit",
});

// Always rebuild both apps: stale artifacts would serve outdated routes.
execSync(`${npm} run build`, { cwd: api, stdio: "inherit" });
execSync(`${npm} run build`, {
  cwd: web,
  env: { ...process.env, MONEYPILOT_API_ORIGIN: apiBase },
  stdio: "inherit",
});

const apiServer = path.join(api, "dist", "server.js");
const nextBin = [
  path.join(web, "node_modules", "next", "dist", "bin", "next"),
  path.join(web, "..", "..", "node_modules", "next", "dist", "bin", "next"),
].find((candidate) => existsSync(candidate));

if (!existsSync(apiServer)) {
  console.error("e2e-server: apps/api/dist/server.js is missing. Run `npm install` at the repo root first.");
  process.exit(1);
}
if (!nextBin) {
  console.error("e2e-server: cannot resolve the next CLI. Run `npm install` at the repo root first.");
  process.exit(1);
}

console.log(`e2e-server: starting api on ${apiBase} (db: ${dbUrl})`);

const apiChild = spawn(process.execPath, [apiServer], {
  cwd: api,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(apiPort),
    DATABASE_URL: dbUrl,
    // The web app's origin: email links point here and the API's CSRF
    // check accepts it (Origin no longer matches the API's own host now
    // that the apps run on separate ports).
    APP_BASE_URL: base,
    ALLOWED_ORIGINS: base,
    // CI runners have no .env file: the production env guard requires an
    // explicit secret. A throwaway random value per boot keeps the e2e
    // environment self-contained (tokens never need to outlive the server).
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || randomBytes(48).toString("base64url"),
    PRIVATE_MODE: process.env.PRIVATE_MODE || "false",
    // The suite registers/logs in far more often than a real user within a
    // minute, all from the same loopback IP — the auth rate limit must not
    // make tests flaky. The production default stays untouched.
    RATE_LIMIT_AUTH_MAX: process.env.RATE_LIMIT_AUTH_MAX || "1000",
  },
  stdio: "inherit",
});

// Wait for the API to accept connections before booting the web app: its
// server components and the proxy health poll hit the API immediately, and
// racing them only produces noisy ECONNREFUSED failures.
const apiReady = new Promise((resolve, reject) => {
  const deadline = Date.now() + 30_000;
  const poll = async () => {
    try {
      const res = await fetch(`${apiBase}/api/health`);
      if (res.ok) return resolve();
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) return reject(new Error("e2e-server: api did not become healthy in 30s"));
    setTimeout(poll, 250);
  };
  poll();
});
const apiExited = new Promise((_, reject) => {
  apiChild.on("exit", (code) => reject(new Error(`e2e-server: api exited early with code ${code ?? 0}`)));
});
await Promise.race([apiReady, apiExited]);

console.log(`e2e-server: starting web on ${base} (api proxy: ${apiBase})`);

const webChild = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: web,
  env: {
    ...process.env,
    NODE_ENV: "production",
    MONEYPILOT_API_ORIGIN: apiBase,
  },
  stdio: "inherit",
});

const children = [apiChild, webChild];

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const child of children) {
  child.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
}
