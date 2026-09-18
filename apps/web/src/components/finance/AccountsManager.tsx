"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@moneypilot/shared";
import { CURRENCIES, ACCOUNT_TYPE_LIST } from "./constants";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ApiClientError, apiFetch } from "@/lib/api-client";

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalanceMinor: number;
  balanceMinor: number;
  archived: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank",
  MPESA: "M-Pesa",
  SAVINGS: "Savings",
  CREDIT: "Credit",
  OTHER: "Other",
};

export function AccountsManager({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("BANK");
  const [currency, setCurrency] = useState("KES");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          currency,
          ...(opening.trim() ? { openingBalance: opening.trim() } : {}),
        }),
      });
      setName("");
      setOpening("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchived(row: AccountRow) {
    setError(null);
    setBusyId(row.id);
    try {
      await apiFetch(`/api/accounts/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !row.archived }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the account.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2">
              <Field label="Account name" htmlFor="acct-name">
                <Input
                  id="acct-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. M-Pesa, KCB account"
                  required
                />
              </Field>
            </div>
            <Field label="Type" htmlFor="acct-type">
              <Select id="acct-type" value={type} onChange={(e) => setType(e.target.value)}>
                {ACCOUNT_TYPE_LIST.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="acct-currency">
              <Select id="acct-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Object.values(CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Opening balance" htmlFor="acct-opening">
              <Input
                id="acct-opening"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-5">
              <Button type="submit" loading={busy}>
                Add account
              </Button>
            </div>
          </form>
          {error ? <div className="mt-4"><Alert variant="error">{error}</Alert></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No accounts yet. Add your first account to start tracking money.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((row) => (
                <li
                  key={row.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                    row.archived ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {TYPE_LABELS[row.type] ?? row.type}
                      </span>
                      {row.archived ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Opening balance {formatMoney(row.openingBalanceMinor, row.currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(row.balanceMinor, row.currency)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleArchived(row)}
                      disabled={busyId !== null}
                      loading={busyId === row.id}
                    >
                      {row.archived ? "Unarchive" : "Archive"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="text-sm text-slate-500">
          Balances are always derived from your transactions — we never store them. Archiving an
          account hides it while keeping the history intact.{" "}
          <Link href="/dashboard/transactions" className="font-medium text-primary-700 hover:underline">
            Add transactions
          </Link>{" "}
          or{" "}
          <Link href="/dashboard/transfers" className="font-medium text-primary-700 hover:underline">
            transfer between accounts
          </Link>
          .
        </CardContent>
      </Card>
    </div>
  );
}