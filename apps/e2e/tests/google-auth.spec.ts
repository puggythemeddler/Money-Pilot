import { test, expect } from "@playwright/test";
import { loginViaUI, registerViaUI } from "./helpers";

/**
 * The e2e environment deliberately runs without GOOGLE_CLIENT_ID/SECRET, so
 * these tests exercise the fully unconfigured path: the start endpoint
 * redirects back with a friendly error instead of visiting Google, and the
 * callback never trusts unmatched state.
 */

test("the login page offers Continue with Google and handles it being unconfigured", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/login\?error=google_not_configured/);
  await expect(page.getByRole("alert").first()).toContainText("isn't set up");
});

test("the register page handles Continue with Google being unconfigured", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  // Login-mode flows land on /login with the explanation.
  await expect(page).toHaveURL(/\/login\?error=google_not_configured/);
  await expect(page.getByRole("alert").first()).toContainText("isn't set up");
});

test("linking from Settings redirects back with the error when Google is unconfigured", async ({ page }) => {
  await registerViaUI(page, "Google Tester");
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Connected accounts" })).toBeVisible();
  await page.getByRole("link", { name: "Connect Google account" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\?error=google_not_configured/);
  await expect(page.getByRole("alert").first()).toContainText("isn't set up");
});

test("the identities endpoint lists nothing for a password account", async ({ page }) => {
  const email = await registerViaUI(page, "Google Tester");
  await loginViaUI(page, email);
  const res = await page.request.get("/api/auth/identities");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.identities).toEqual([]);
});

test("the callback refuses requests without a matching transaction", async ({ page }) => {
  await page.goto("/api/auth/google/callback?code=forged-code&state=forged-state");
  await expect(page).toHaveURL(/\/login\?error=google_state/);
  await expect(page.getByRole("alert").first()).toContainText("expired");
});

test("unlinking a provider that is not connected returns 404", async ({ page }) => {
  await registerViaUI(page, "Google Tester");
  const res = await page.request.delete("/api/auth/identities/google", {
    data: { password: "Sup3r-Secure!" },
  });
  expect(res.status()).toBe(404);
});
