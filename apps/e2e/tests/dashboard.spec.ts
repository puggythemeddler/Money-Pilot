import { test, expect, type Page } from "@playwright/test";
import { createAccountViaApi, isoDay, registerViaUI } from "./helpers";

/** Reads the money value displayed next to a dashboard card label. */
function cardValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
}

test("the dashboard aggregates balances, cash flow and recent activity", async ({ page }) => {
  await registerViaUI(page, "Dash Tester");
  const account = await createAccountViaApi(page, { name: "Main KES wallet", openingBalance: "10000" });

  const cat = await (
    await page.request.post("/api/categories", {
      data: { name: "Food and drinks", kind: "EXPENSE", color: "#dc2626" },
    })
  ).json();

  const seed = [
    { kind: "INCOME", amount: "5000", description: "Consulting fee", categoryId: undefined },
    { kind: "EXPENSE", amount: "1200", description: "Team lunch", categoryId: cat.data.category.id },
    { kind: "EXPENSE", amount: "300", description: "Airtime top-up", categoryId: undefined },
  ];
  for (const item of seed) {
    const res = await page.request.post("/api/transactions", {
      data: {
        kind: item.kind,
        accountId: account.id,
        amount: item.amount,
        transactionDate: isoDay(),
        description: item.description,
        ...(item.categoryId ? { categoryId: item.categoryId } : {}),
      },
    });
    expect(res.status()).toBe(201);
  }

  await page.goto("/dashboard");

  // Header greeting.
  await expect(page.getByRole("heading", { name: /Karibu, Dash/ })).toBeVisible();

  // Summary cards: available = 10,000 + 5,000 − 1,500.
  await expect(cardValue(page, "Money in accounts")).toHaveText(/13,500\.00/);
  await expect(cardValue(page, "Spent this month")).toHaveText(/1,500\.00/);
  await expect(cardValue(page, "Net this month")).toHaveText(/3,500\.00/);
  await expect(page.getByText(/^earned /)).toHaveText(/5,000\.00/);

  // Accounts panel with derived balance. Scoped to list items (the quick-add
  // account <select> repeats the name as an option and recent-activity rows
  // append a date suffix).
  await expect(page.getByRole("listitem").getByText("Main KES wallet", { exact: true })).toBeVisible();
  await expect(page.getByText(/13,500\.00/).first()).toBeVisible();

  // Top spending groups expenses by category (name + colored badge).
  await expect(page.getByText("Top spending")).toBeVisible();
  await expect(page.getByText("Food and drinks").first()).toBeVisible();

  // Recent activity lists the latest records across accounts.
  await expect(page.getByText("Recent activity")).toBeVisible();
  await expect(page.getByText("Consulting fee")).toBeVisible();
  await expect(page.getByText("Team lunch")).toBeVisible();
  await expect(page.getByText("Airtime top-up")).toBeVisible();
});

test("a dashboard with an account but no activity shows quiet empty states", async ({ page }) => {
  await registerViaUI(page, "Dash Tester");
  await createAccountViaApi(page, { name: "Quiet wallet", openingBalance: "0" });
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /Karibu, Dash/ })).toBeVisible();
  // Zero accounts → the onboarding card; with an account → quiet per-panel states.
  await expect(page.getByRole("listitem").getByText("Quiet wallet")).toBeVisible();
  await expect(page.getByText("No spending recorded this month yet.")).toBeVisible();
  await expect(page.getByText("No transactions yet — record the first one.")).toBeVisible();
});

test("a fresh account with no accounts sees the guided first-run", async ({ page }) => {
  await registerViaUI(page, "Dash Tester");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /Karibu, Dash/ })).toBeVisible();
  await expect(page.getByText("Get started")).toBeVisible();
  // Step 1 is actionable with Kenyan presets; step 2 stays locked.
  await expect(page.getByText("Add an account", { exact: true })).toBeVisible();
  await expect(page.getByText("Add an account to unlock this step.")).toBeVisible();
  await expect(page.getByRole("button", { name: "M-Pesa" })).toBeVisible();
});

test("a new user sets up an account and records the first transaction from the dashboard", async ({ page }) => {
  await registerViaUI(page, "First Run");

  await page.goto("/dashboard");
  // Step 1: one-click M-Pesa preset plus an opening balance.
  await page.getByRole("button", { name: "M-Pesa" }).click();
  await page.fill("#getstarted-opening", "5000");
  await page.getByRole("button", { name: "Add account" }).click();

  // Step 2 unlocks and the account shows up with its balance.
  await expect(page.getByText("Add an account to unlock this step.")).toHaveCount(0);
  await expect(page.getByRole("listitem").getByText("M-Pesa", { exact: true })).toBeVisible();

  // Record a first expense through the quick-add form.
  await page.fill("#quick-amount", "150");
  await page.fill("#quick-description", "Matatu fare");
  await page.getByRole("button", { name: "Add expense" }).click();

  // The dashboard reflects the new record.
  await expect(page.getByText("Matatu fare")).toBeVisible();
  await expect(page.getByText(/150\.00/).first()).toBeVisible();
});
