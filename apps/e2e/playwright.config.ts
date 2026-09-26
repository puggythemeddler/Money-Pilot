import { defineConfig, devices } from "@playwright/test";

// The webServer boots `apps/web` in production mode against a fresh, isolated
// SQLite database (see apps/web/scripts/e2e-server.mjs). Each test registers
// its own user with a unique email, so tests can run fully in parallel.
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
    command: "node ../web/scripts/e2e-server.mjs",
    url: "http://localhost:3105/api/health",
    // The first run on a clean clone also builds the web app (next build).
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
