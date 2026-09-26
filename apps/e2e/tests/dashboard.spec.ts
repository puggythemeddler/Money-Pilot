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

  // Accounts panel with derived balance. exact: the recent-activity rows
  // also mention the account name with a date suffix.
  await expect(page.getByText("Main KES wallet", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Quiet wallet")).toBeVisible();
  await expect(page.getByText("No spending recorded this month yet.")).toBeVisible();
  await expect(page.getByText("No transactions yet — record the first one.")).toBeVisible();
});

test("a fresh account with no accounts sees the onboarding card", async ({ page }) => {
  await registerViaUI(page, "Dash Tester");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /Karibu, Dash/ })).toBeVisible();
  await expect(page.getByText("Build your financial picture")).toBeVisible();
  await expect(page.getByText("Add an account →")).toBeVisible();
});
