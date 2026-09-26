import { defineConfig, devices } from "@playwright/test";

// The webServer boots the full two-process stack: the MoneyPilot API
// (apps/api on port 4000, fresh isolated SQLite database) plus the web app
// (next start on port 3105) proxying /api/* to it — see
// apps/e2e/scripts/e2e-server.mjs. Each test registers its own user with a
// unique email. The health URL goes through the web proxy, proving the
// whole chain (web up, rewrite wired, API up).
export default defineConfig({
  testDir: "./tests",
  // One worker: every test talks to the same SQLite-backed server, and
  // serial runs stay immune to browser-session instability under load.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    // `localhost` (not 127.0.0.1): Playwright's API request context only
    // exempts localhost from the "no Secure cookies over http" rule, and the
    // app's session cookies are __Host- (Secure) — API seeding from tests
    // would otherwise arrive unauthenticated.
    baseURL: "http://localhost:3105",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3105/api/health",
    // The first run on a clean clone also builds both the API and the web app.
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
