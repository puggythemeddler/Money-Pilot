"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@moneypilot/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { CURRENCIES, ACCOUNT_TYPE_LIST } from "@/components/finance/constants";

export interface HouseholdMemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  canRecord: boolean;
  joinedAt: string;
}

export interface HouseholdAccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: number;
  archived: boolean;
}

export interface HouseholdInviteRow {
  id: string;
  canRecord: boolean;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface HouseholdView {
  household: { id: string; name: string; createdAt: string };
  me: { role: string; canRecord: boolean };
  members: HouseholdMemberRow[];
  accounts: HouseholdAccountRow[];
  invites?: HouseholdInviteRow[];
}

export interface HouseholdOverview {
  household: { id: string; name: string };
  accounts: { id: string; name: string; currency: string; balanceMinor: number }[];
  month: { incomeMinor: number; expenseMinor: number; netMinor: number };
  memberSpending: { userId: string; name: string; spentMinor: number; active: boolean }[];
  recentActivity: {
    id: string;
    kind: string;
    amountMinor: number;
    currency: string;
    description: string | null;
    transactionDate: string;
    accountName: string;
    recordedByName: string;
  }[];
}

const TYPE_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank",
  MPESA: "M-Pesa",
  SAVINGS: "Savings",
  CREDIT: "Credit",
  OTHER: "Other",
};

export function HouseholdManager({
  household,
  overview,
  displayCurrency,
}: {
  household: HouseholdView | null;
  overview: HouseholdOverview | null;
  displayCurrency: string;
}) {
  const router = useRouter();
  const isOwner = household?.me.role === "OWNER";

  const [createName, setCreateName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [inviteCanRecord, setInviteCanRecord] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("BANK");
  const [accountCurrency, setAccountCurrency] = useState(displayCurrency);
  const [accountOpening, setAccountOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function reset() {
    setError(null);
    setInviteLink(null);
    setCopied(false);
  }

  async function run(key: string, fn: () => Promise<void>) {
    reset();
    setBusy(key);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function createHousehold(e: React.FormEvent) {
    e.preventDefault();
    await run("create", async () => {
      await apiFetch("/api/household", {
        method: "POST",
        body: JSON.stringify({ name: createName.trim() }),
      });
      setCreateName("");
    });
  }

  async function renameHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    await run("rename", async () => {
      await apiFetch("/api/household", {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenameValue("");
    });
  }

  async function leave() {
    if (!household) return;
    const message = isOwner
      ? "Leave this household? Ownership passes to the longest-standing member (or the household is archived if you are the last one)."
      : "Leave this household? You will lose access to its shared accounts.";
    if (!window.confirm(message)) return;
    await run("leave", async () => {
      await apiFetch("/api/household", { method: "DELETE" });
    });
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    await run("invite", async () => {
      const data = await apiFetch<{ invite: { token: string } }>("/api/household/invites", {
        method: "POST",
        body: JSON.stringify({ canRecord: inviteCanRecord }),
      });
      setInviteLink(`${window.location.origin}/dashboard/household/invite?token=${data.invite.token}`);
    });
  }

  async function revokeInvite(id: string) {
    await run(`revoke-${id}`, async () => {
      await apiFetch(`/api/household/invites/${id}`, { method: "DELETE" });
    });
  }

  async function setCanRecord(member: HouseholdMemberRow, canRecord: boolean) {
    await run(`member-${member.id}`, async () => {
      await apiFetch(`/api/household/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ canRecord }),
      });
    });
  }

  async function removeMember(member: HouseholdMemberRow) {
    if (!window.confirm(`Remove ${member.name} from the household?`)) return;
    await run(`member-${member.id}`, async () => {
      await apiFetch(`/api/household/members/${member.id}`, { method: "DELETE" });
    });
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    await run("account", async () => {
      await apiFetch("/api/household/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: accountName.trim(),
          type: accountType,
          currency: accountCurrency,
          ...(accountOpening.trim() ? { openingBalance: accountOpening.trim() } : {}),
        }),
      });
      setAccountName("");
      setAccountOpening("");
    });
  }

  async function toggleAccount(row: HouseholdAccountRow) {
    await run(`account-${row.id}`, async () => {
      await apiFetch(`/api/household/accounts/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !row.archived }),
      });
    });
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!household) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Start a household</CardTitle>
            <CardDescription>
              Share selected accounts with a partner or family. Everyone keeps their private
              ledger; only the joint accounts you add here are shared.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createHousehold} className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-xs">
                <Field label="Household name" htmlFor="hh-name">
                  <Input
                    id="hh-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Mwangi household"
                    required
                    maxLength={60}
                  />
                </Field>
              </div>
              <Button type="submit" loading={busy === "create"}>
                Create household
              </Button>
            </form>
            {error ? (
              <div className="mt-4">
                <Alert variant="error">{error}</Alert>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <p className="text-sm text-muted">
          Have an invite link from a family member? Open it while logged in to join their
          household.
        </p>
      </div>
    );
  }

  const monthNet = overview?.month.netMinor ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-heading">{household.household.name}</p>
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                {isOwner ? "Owner" : household.me.canRecord ? "Member · can record" : "Member · read-only"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-faint">
              {household.members.length} {household.members.length === 1 ? "member" : "members"} ·{" "}
              {household.accounts.filter((a) => !a.archived).length} shared{" "}
              {household.accounts.filter((a) => !a.archived).length === 1 ? "account" : "accounts"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isOwner ? (
              <form onSubmit={renameHousehold} className="flex items-center gap-2">
                <Input
                  aria-label="New household name"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Rename household"
                  maxLength={60}
                  className="w-44"
                />
                <Button type="submit" variant="outline" size="sm" disabled={!renameValue.trim()} loading={busy === "rename"}>
                  Rename
                </Button>
              </form>
            ) : null}
            <Button variant="danger" size="sm" onClick={leave} loading={busy === "leave"}>
              Leave
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Shared income this month</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMoney(overview?.month.incomeMinor ?? 0, displayCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Shared spending this month</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {formatMoney(overview?.month.expenseMinor ?? 0, displayCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Shared net this month</CardDescription>
            <CardTitle
              className={`text-xl font-bold tabular-nums ${monthNet < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {formatMoney(monthNet, displayCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shared accounts</CardTitle>
            <CardDescription>
              Joint balances every member can see{household.me.canRecord ? " and record into" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {household.accounts.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted">
                No shared accounts yet{isOwner ? " — create the first one below." : "."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {household.accounts.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center justify-between gap-3 px-6 py-3 ${a.archived ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-heading">{a.name}</p>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                          {TYPE_LABELS[a.type] ?? a.type}
                        </span>
                        {a.archived ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            Archived
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-sm font-semibold tabular-nums text-heading">
                        {formatMoney(a.balanceMinor, a.currency)}
                      </p>
                      {isOwner ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAccount(a)}
                          disabled={busy !== null}
                          loading={busy === `account-${a.id}`}
                        >
                          {a.archived ? "Unarchive" : "Archive"}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          {isOwner ? (
            <CardContent className="border-t border-line">
              <form onSubmit={createAccount} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Account name" htmlFor="hh-acct-name">
                  <Input
                    id="hh-acct-name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Family M-Pesa"
                    required
                    maxLength={60}
                  />
                </Field>
                <Field label="Type" htmlFor="hh-acct-type">
                  <Select id="hh-acct-type" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    {ACCOUNT_TYPE_LIST.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t] ?? t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Currency" htmlFor="hh-acct-currency">
                  <Select
                    id="hh-acct-currency"
                    value={accountCurrency}
                    onChange={(e) => setAccountCurrency(e.target.value)}
                  >
                    {Object.values(CURRENCIES).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Opening balance" htmlFor="hh-acct-opening">
                  <Input
                    id="hh-acct-opening"
                    value={accountOpening}
                    onChange={(e) => setAccountOpening(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </Field>
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button type="submit" loading={busy === "account"}>
                    Add shared account
                  </Button>
                </div>
              </form>
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {isOwner
                ? "Control who can record into the shared accounts"
                : "Everyone in this household"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {household.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-heading">{m.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          m.role === "OWNER" ? "bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300" : "bg-surface-2 text-muted"
                        }`}
                      >
                        {m.role === "OWNER" ? "Owner" : m.canRecord ? "Can record" : "Read-only"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-faint">{m.email}</p>
                  </div>
                  {isOwner && m.role !== "OWNER" ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCanRecord(m, !m.canRecord)}
                        disabled={busy !== null}
                        loading={busy === `member-${m.id}`}
                      >
                        {m.canRecord ? "Make read-only" : "Allow recording"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember(m)}
                        disabled={busy !== null}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {isOwner ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Invite a member</CardTitle>
              <CardDescription>
                Single-use link, valid for 14 days. Only its digest is stored — the link is shown
                exactly once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={createInvite} className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-body">
                  <input
                    type="checkbox"
                    checked={inviteCanRecord}
                    onChange={(e) => setInviteCanRecord(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-primary-700 focus:ring-primary-700"
                  />
                  Allow recording into shared accounts
                </label>
                <Button type="submit" loading={busy === "invite"}>
                  Create invite link
                </Button>
              </form>

              {inviteLink ? (
                <div className="space-y-2 rounded-lg border border-primary-200 bg-primary-50/60 dark:border-primary-900 dark:bg-primary-950/40 p-3">
                  <p className="text-xs font-medium text-primary-800 dark:text-primary-200">
                    Share this link — it will not be shown again:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs text-body">
                      {inviteLink}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyLink}>
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {household.invites && household.invites.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                    Invitation history
                  </p>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {household.invites.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0 text-xs text-body">
                          <span className="font-medium text-heading">
                            {i.status === "PENDING" ? "Pending" : i.status === "ACCEPTED" ? "Accepted" : "Revoked"}
                          </span>{" "}
                          · {i.canRecord ? "can record" : "read-only"} · expires{" "}
                          {new Date(i.expiresAt).toLocaleDateString()}
                        </div>
                        {i.status === "PENDING" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeInvite(i.id)}
                            disabled={busy !== null}
                            loading={busy === `revoke-${i.id}`}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent shared activity</CardTitle>
            <CardDescription>Across all shared accounts, with who recorded what</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!overview || overview.recentActivity.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted">
                No shared activity yet. Record a transaction onto a shared account to see it here.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {overview.recentActivity.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="truncate text-sm font-medium text-heading">
                          {t.description || (t.kind === "TRANSFER" ? "Transfer" : "Transaction")}
                        </p>
                        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                          {t.recordedByName}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-faint">
                        {t.accountName} ·{" "}
                        {new Date(t.transactionDate).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        t.amountMinor < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {t.amountMinor < 0 ? "−" : "+"}
                      {formatMoney(Math.abs(t.amountMinor), t.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {overview && overview.memberSpending.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Spending per member this month</CardTitle>
              <CardDescription>Expenses recorded onto shared accounts</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {overview.memberSpending.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 px-6 py-3">
                    <p className="truncate text-sm font-medium text-heading">{m.name}</p>
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        m.active ? "text-red-600 dark:text-red-400" : "text-faint"
                      }`}
                    >
                      {formatMoney(m.spentMinor, displayCurrency)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        Shared accounts are visible to every member; your personal accounts stay private and never
        appear in the household view. Totals combine shared accounts in {displayCurrency}.
      </p>
    </div>
  );
}
