import { test, expect } from "@playwright/test";
import { loginViaUI, registerViaUI } from "./helpers";

/**
 * The e2e environment deliberately runs without GOOGLE_CLIENT_ID/SECRET, so
 * these tests exercise the fully unconfigured path: the web pages hide the
 * Google button (advertising a flow the server cannot complete is the bug this
 * guards against), the start endpoint redirects back with a friendly error if
 * visited directly, and the callback never trusts unmatched state.
 */

test("the capabilities endpoint reports what this deployment can do", async ({ page }) => {
  const res = await page.request.get("/api/auth/capabilities");
  expect(res.status()).toBe(200);
  const body = await res.json();
  // No Google credentials and no SMTP transport in the e2e environment.
  expect(body.data).toEqual({ googleSignIn: false, emailDelivery: false });
});

test("Google sign-in is hidden on the login page when the API is unconfigured", async ({ page }) => {
  await page.goto("/login");
  // The button is not advertised when the server cannot complete the flow.
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
  // The start endpoint still fails closed with a clear message if visited directly.
  await page.goto("/api/auth/google/start");
  await expect(page).toHaveURL(/\/login\?error=google_not_configured/);
  await expect(page.getByRole("alert").first()).toContainText("isn't set up");
});

test("Google sign-in is hidden on the register page when the API is unconfigured", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
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
