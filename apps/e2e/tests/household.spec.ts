import { test, expect } from "@playwright/test";
import { createAccountViaApi, isoDay, registerViaUI } from "./helpers";

async function createHouseholdViaApi(page: import("@playwright/test").Page, name: string) {
  const res = await page.request.post("/api/household", { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data.household as { id: string; name: string };
}

async function createJointAccountViaApi(
  page: import("@playwright/test").Page,
  input: { name: string; currency?: string },
) {
  const res = await page.request.post("/api/household/accounts", {
    data: { name: input.name, type: "MPESA", currency: input.currency ?? "KES" },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.account as { id: string; name: string; currency: string };
}

async function createInviteViaApi(page: import("@playwright/test").Page, canRecord: boolean) {
  const res = await page.request.post("/api/household/invites", { data: { canRecord } });
  expect(res.status()).toBe(201);
  return (await res.json()).data.invite as { id: string; token: string; canRecord: boolean };
}

async function acceptInvite(page: import("@playwright/test").Page, token: string) {
  return page.request.post("/api/household/invites/accept", { data: { token } });
}

async function recordExpense(
  page: import("@playwright/test").Page,
  accountId: string,
  amount: string,
  description: string,
) {
  return page.request.post("/api/transactions", {
    data: { kind: "EXPENSE", accountId, amount, transactionDate: isoDay(), description },
  });
}

test("owner creates a household, shared account and invite link; member joins via the link", async ({
  page,
  browser,
}) => {
  await registerViaUI(page, "Owner Tester");
  await page.goto("/dashboard/household");

  // Create the household.
  await page.fill("#hh-name", "Njeri household");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page.getByText("Njeri household").first()).toBeVisible();
  await expect(page.getByText("Owner", { exact: true }).first()).toBeVisible();

  // Create a joint account from the owner-only form.
  await page.fill("#hh-acct-name", "Family M-Pesa");
  await page.selectOption("#hh-acct-type", "MPESA");
  await page.getByRole("button", { name: "Add shared account" }).click();
  await expect(page.getByText("Family M-Pesa").first()).toBeVisible();

  // The Accounts page shows the shared account with a "Managed in Household" note.
  await page.goto("/dashboard/accounts");
  await expect(page.getByText("Family M-Pesa").first()).toBeVisible();
  await expect(page.getByText("Managed in Household").first()).toBeVisible();

  // The invite link is rendered exactly once, with the token in the URL.
  await page.goto("/dashboard/household");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = (await page.locator("code").first().textContent()) ?? "";
  expect(link).toContain("/dashboard/household/invite?token=");
  const token = new URL(link).searchParams.get("token");
  expect(token).toBeTruthy();

  // A second user registers, then accepts through the link.
  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await registerViaUI(memberPage, "Member Tester");
  await memberPage.goto(link);
  await memberPage.getByRole("button", { name: "Accept invitation" }).click();
  await memberPage.waitForURL("**/dashboard/household");

  // The member sees the household, its shared account, and a members list.
  await expect(memberPage.getByText("Njeri household").first()).toBeVisible();
  await expect(memberPage.getByText("Family M-Pesa").first()).toBeVisible();
  await expect(memberPage.getByText("Member Tester").first()).toBeVisible();
  await memberPage.goto("/dashboard/accounts");
  await expect(memberPage.getByText("Family M-Pesa").first()).toBeVisible();
  await memberCtx.close();
});

test("a member with record permission records onto the shared account; the owner sees attribution", async ({
  page,
  browser,
}) => {
  await registerViaUI(page, "Owner Two");
  await createHouseholdViaApi(page, "Record household");
  const joint = await createJointAccountViaApi(page, { name: "Joint wallet" });
  const invite = await createInviteViaApi(page, true);

  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await registerViaUI(memberPage, "Member Two");
  expect((await acceptInvite(memberPage, invite.token)).status()).toBe(200);

  // The member records an expense onto the joint account...
  expect((await recordExpense(memberPage, joint.id, "120.50", "Saturday groceries")).status()).toBe(201);

  // ...and moves money from their own account into the shared one.
  const memberAccount = await createAccountViaApi(memberPage, { name: "Member cash" });
  const transferRes = await memberPage.request.post("/api/transfers", {
    data: {
      fromAccountId: memberAccount.id,
      toAccountId: joint.id,
      amount: "100",
      transactionDate: isoDay(),
      description: "Household contribution",
    },
  });
  expect(transferRes.status()).toBe(201);

  // The member sees the shared entry with the recorded-by chip.
  await memberPage.goto("/dashboard/transactions");
  await expect(memberPage.getByText("Saturday groceries").first()).toBeVisible();
  await expect(memberPage.getByText("Shared · Member Two").first()).toBeVisible();

  // The owner sees the entry and the attribution on the household page.
  await page.goto("/dashboard/household");
  await expect(page.getByText("Saturday groceries").first()).toBeVisible();
  await expect(page.getByText("KSh 120.50").first()).toBeVisible();

  // The overview API reports the expense, attribution and the transfer's in leg.
  const overview = (await (await page.request.get("/api/household/overview")).json()).data.overview;
  expect(overview.month.expenseMinor).toBe(12050);
  expect(overview.recentActivity.some((t: { description: string | null; recordedByName: string }) => t.description === "Saturday groceries" && t.recordedByName === "Member Two")).toBe(true);

  // The joint balance aggregates entries from BOTH members (the expense and
  // the transfer's in leg): 0 - 120.50 + 100 = -20.50.
  const ownerAccounts = (await (await page.request.get("/api/accounts")).json()).data.accounts as {
    id: string;
    balanceMinor: number;
  }[];
  const jointRow = ownerAccounts.find((a) => a.id === joint.id);
  expect(jointRow?.balanceMinor).toBe(-2050);

  // The transfer row names the member's private account, so it stays visible
  // only to the member; the owner still sees its in-leg on the joint account.
  const ownerTransfers = (await (await page.request.get("/api/transfers")).json()).data.transfers as {
    description: string | null;
  }[];
  expect(ownerTransfers.some((t) => t.description === "Household contribution")).toBe(false);
  const ownerTx = (await (await page.request.get("/api/transactions")).json()).data.items as {
    description: string | null;
    accountId: string;
  }[];
  expect(ownerTx.some((t) => t.description === "Household contribution" && t.accountId === joint.id)).toBe(true);
  const memberTransfers = (await (await memberPage.request.get("/api/transfers")).json()).data.transfers as {
    description: string | null;
  }[];
  expect(memberTransfers.some((t) => t.description === "Household contribution")).toBe(true);
  await memberCtx.close();
});

test("a read-only member sees shared entries but cannot record, edit or delete them", async ({
  page,
  browser,
}) => {
  await registerViaUI(page, "Owner Three");
  await createHouseholdViaApi(page, "Read-only household");
  const joint = await createJointAccountViaApi(page, { name: "View wallet" });
  expect((await recordExpense(page, joint.id, "300", "Owner lunch")).status()).toBe(201);
  const invite = await createInviteViaApi(page, false);

  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await registerViaUI(memberPage, "Viewer Three");
  expect((await acceptInvite(memberPage, invite.token)).status()).toBe(200);

  // Read access: the owner's entry on the shared account is listed.
  const list = (await (await memberPage.request.get("/api/transactions")).json()).data.items as {
    id: string;
    accountId: string;
    description: string | null;
    shared: boolean;
  }[];
  const entry = list.find((t) => t.accountId === joint.id);
  expect(entry?.description).toBe("Owner lunch");
  expect(entry?.shared).toBe(true);

  // Write access is denied everywhere — including transfers out of the joint account.
  expect((await recordExpense(memberPage, joint.id, "10", "Blocked")).status()).toBe(403);
  expect((await memberPage.request.patch(`/api/transactions/${entry!.id}`, { data: { amount: "1" } })).status()).toBe(403);
  expect((await memberPage.request.delete(`/api/transactions/${entry!.id}`)).status()).toBe(403);
  const memberAccount = await createAccountViaApi(memberPage, { name: "Viewer cash" });
  expect((await memberPage.request.post("/api/transfers", {
    data: { fromAccountId: joint.id, toAccountId: memberAccount.id, amount: "10", transactionDate: isoDay() },
  })).status()).toBe(403);

  // The household page opens read-only for the member.
  await memberPage.goto("/dashboard/household");
  await expect(memberPage.getByText("Member · read-only").first()).toBeVisible();
  await memberCtx.close();
});

test("personal accounts stay private between household members", async ({ page, browser }) => {
  await registerViaUI(page, "Owner Four");
  const privateAccount = await createAccountViaApi(page, { name: "Secret savings" });
  await createHouseholdViaApi(page, "Privacy household");
  const joint = await createJointAccountViaApi(page, { name: "Open wallet" });
  const invite = await createInviteViaApi(page, true);

  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await registerViaUI(memberPage, "Member Four");
  expect((await acceptInvite(memberPage, invite.token)).status()).toBe(200);

  // The member's account list has the shared account but not the owner's personal one.
  const accounts = (await (await memberPage.request.get("/api/accounts")).json()).data.accounts as {
    id: string;
    shared: boolean;
  }[];
  expect(accounts.some((a) => a.id === joint.id && a.shared)).toBe(true);
  expect(accounts.some((a) => a.id === privateAccount.id)).toBe(false);

  // Direct access to the personal account is a 404 — existence never leaks.
  expect((await memberPage.request.get(`/api/accounts/${privateAccount.id}`)).status()).toBe(404);
  expect((await recordExpense(memberPage, privateAccount.id, "5", "Sneaky")).status()).toBe(404);

  // Shared accounts are managed by the owner only: members get 403/404, the
  // owner's personal-account route refuses with a redirect to the household.
  expect((await memberPage.request.patch(`/api/household/accounts/${joint.id}`, { data: { archived: true } })).status()).toBe(403);
  expect((await memberPage.request.patch(`/api/accounts/${joint.id}`, { data: { name: "Hijacked" } })).status()).toBe(404);
  expect((await page.request.patch(`/api/accounts/${joint.id}`, { data: { name: "Hijacked" } })).status()).toBe(400);
  await memberCtx.close();
});

test("owner manages permissions and members; the last member leaving archives the household", async ({
  page,
  browser,
}) => {
  await registerViaUI(page, "Owner Five");
  await createHouseholdViaApi(page, "Lifecycle household");
  const joint = await createJointAccountViaApi(page, { name: "Lifecycle wallet" });
  const invite = await createInviteViaApi(page, true);

  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await registerViaUI(memberPage, "Member Five");
  expect((await acceptInvite(memberPage, invite.token)).status()).toBe(200);
  expect((await recordExpense(memberPage, joint.id, "50", "Allowed entry")).status()).toBe(201);

  // The owner flips the member to read-only; recording now fails.
  const view = (await (await page.request.get("/api/household")).json()).data.household;
  const member = (view.members as { id: string; name: string }[]).find((m) => m.name === "Member Five");
  expect((await page.request.patch(`/api/household/members/${member!.id}`, { data: { canRecord: false } })).status()).toBe(200);
  expect((await recordExpense(memberPage, joint.id, "20", "Blocked entry")).status()).toBe(403);

  // Flipping back restores the permission.
  expect((await page.request.patch(`/api/household/members/${member!.id}`, { data: { canRecord: true } })).status()).toBe(200);
  expect((await recordExpense(memberPage, joint.id, "20", "Allowed again")).status()).toBe(201);

  // Removing the member ends their access: household null, joint account invisible.
  expect((await page.request.delete(`/api/household/members/${member!.id}`)).status()).toBe(200);
  const afterRemoval = (await (await memberPage.request.get("/api/household")).json()).data.household;
  expect(afterRemoval).toBeNull();
  const memberAccounts = (await (await memberPage.request.get("/api/accounts")).json()).data.accounts as { id: string }[];
  expect(memberAccounts.some((a) => a.id === joint.id)).toBe(false);
  await memberCtx.close();

  // The owner leaving last archives the household and hides the joint account.
  expect((await page.request.delete("/api/household")).status()).toBe(200);
  const afterLeave = (await (await page.request.get("/api/household")).json()).data.household;
  expect(afterLeave).toBeNull();
  const ownerAccounts = (await (await page.request.get("/api/accounts")).json()).data.accounts as { id: string }[];
  expect(ownerAccounts.some((a) => a.id === joint.id)).toBe(false);
});
