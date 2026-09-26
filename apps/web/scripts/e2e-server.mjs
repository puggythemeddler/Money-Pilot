// Boots a disposable production server for the Playwright suite: a fresh
// SQLite database, the schema pushed, and `next start` on E2E_PORT (default
// 3105). Builds the web app first if no production build exists so a clean
// clone can run `npm run e2e` without extra steps.
import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.E2E_PORT || 3105);
// `localhost` (not 127.0.0.1): Playwright's request context exempts only
// localhost from the "no Secure cookies over http" rule, and the app's
// session cookies are __Host- (Secure).
const base = `http://localhost:${port}`;
const dbUrl = process.env.E2E_DB_URL || "file:./e2e-playwright.db";
const dbFile = path.join(web, "prisma", dbUrl.replace("file:", ""));

await rm(dbFile, { force: true }).catch(() => {});
await rm(`${dbFile}-journal`, { force: true }).catch(() => {});
await mkdir(path.dirname(dbFile), { recursive: true }).catch(() => {});

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const env = { ...process.env, DATABASE_URL: dbUrl };

// Generates the SQLite client too: a prior `prisma generate` (PostgreSQL,
// used for the production build) would otherwise leave the wrong client in
// place for the e2e runtime.
execSync(`${npx} prisma db push --schema prisma/schema.sqlite.prisma`, {
  cwd: web,
  env,
  stdio: "inherit",
});

// Always rebuild: a stale .next from a previous run would serve outdated
// routes (new pages would 404) — the served build must match this tree.
execSync(`${npx} next build`, { cwd: web, env, stdio: "inherit" });

const nextBin = [
  path.join(web, "node_modules", "next", "dist", "bin", "next"),
  path.join(web, "..", "..", "node_modules", "next", "dist", "bin", "next"),
].find((candidate) => existsSync(candidate));

if (!nextBin) {
  console.error("e2e-server: cannot resolve the next CLI. Run `npm install` at the repo root first.");
  process.exit(1);
}

console.log(`e2e-server: starting next start on ${base} (db: ${dbUrl})`);

const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: web,
  env: {
    ...env,
    APP_BASE_URL: base,
    NODE_ENV: "production",
    // CI runners have no .env file: the production env guard requires an
    // explicit secret. A throwaway random value per boot keeps the e2e
    // environment self-contained (tokens never need to outlive the server).
    AUTH_JWT_SECRET:
      process.env.AUTH_JWT_SECRET || randomBytes(48).toString("base64url"),
    PRIVATE_MODE: process.env.PRIVATE_MODE || "false",
    // The suite registers/logs in far more often than a real user within a
    // minute, all from the same loopback IP — the auth rate limit must not
    // make tests flaky. The production default stays untouched.
    RATE_LIMIT_AUTH_MAX: process.env.RATE_LIMIT_AUTH_MAX || "1000",
  },
  stdio: "inherit",
});

const shutdown = () => {
  child.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => process.exit(code ?? 0));
