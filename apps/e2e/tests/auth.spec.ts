import { test, expect } from "@playwright/test";
import { loginViaUI, logoutViaUI, registerViaUI, uniqueEmail } from "./helpers";

test("protected pages redirect signed-out users to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("registering creates a session and lands on the dashboard", async ({ page }) => {
  await registerViaUI(page, "Auth Tester");
  await expect(page.getByRole("heading", { name: /Karibu, Auth/ })).toBeVisible();
});

test("invalid credentials show an error and stay on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", uniqueEmail("ghost"));
  await page.fill("#password", "wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  // .first(): Next.js also renders a role=alert route announcer at the end
  // of the body; the form's error alert always comes first.
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("logging out clears the session and protects the app again", async ({ page }) => {
  const email = await registerViaUI(page, "Auth Tester");
  await logoutViaUI(page);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  // The API is protected too, not just the pages.
  const res = await page.request.get("/api/accounts");
  expect(res.status()).toBe(401);

  // Logging back in with the same credentials works.
  await loginViaUI(page, email);
  await expect(page.getByRole("heading", { name: /Karibu, Auth/ })).toBeVisible();
});

test("a tampered session cookie is rejected gracefully", async ({ page }) => {
  await registerViaUI(page, "Auth Tester");
  await logoutViaUI(page);

  // __Host- cookies cannot be planted via addCookies (Chromium's CDP rejects
  // the prefix rules against a plain-http URL); document.cookie works because
  // Chromium treats localhost as a trustworthy origin.
  await page.goto("/login");
  await page.evaluate(() => {
    document.cookie = "__Host-mp_access=tampered-session-token; path=/; secure; samesite=lax";
  });

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get("/api/accounts");
  expect(res.status()).toBe(401);
});

test("the login page links to registration", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register/);
});

test("password validation rejects weak passwords", async ({ page }) => {
  await page.goto("/register");
  await page.fill("#name", "Auth Tester");
  await page.fill("#email", uniqueEmail());
  await page.fill("#password", "short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});
