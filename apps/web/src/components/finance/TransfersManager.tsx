"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@moneypilot/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import type { AccountOption } from "./TransactionsManager";

export interface TransferItem {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amountMinor: number;
  currency: string;
  description: string | null;
  transactionDate: string;
}

export function TransfersManager({ transfers, accounts }: { transfers: TransferItem[]; accounts: AccountOption[] }) {
  const router = useRouter();
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body: Record<string, string> = {
      fromAccountId,
      toAccountId,
      amount: amount.trim(),
      transactionDate: date,
    };
    if (description.trim()) body.description = description.trim();
    try {
      await apiFetch("/api/transfers", { method: "POST", body: JSON.stringify(body) });
      setFromAccountId("");
      setToAccountId("");
      setAmount("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await apiFetch(`/api/transfers/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete the transfer.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="From account" htmlFor="tr-from">
              <Select id="tr-from" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required>
                <option value="" disabled>
                  Select source
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To account" htmlFor="tr-to">
              <Select id="tr-to" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                <option value="" disabled>
                  Select destination
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" htmlFor="tr-amount">
              <Input
                id="tr-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Date" htmlFor="tr-date">
              <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Description" htmlFor="tr-description">
              <Input
                id="tr-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Move money
              </Button>
            </div>
          </form>
          {error ? (
            <div className="mt-4">
              <Alert variant="error">{error}</Alert>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          {transfers.length} {transfers.length === 1 ? "transfer" : "transfers"}
        </p>
        <CardContent className="p-0">
          {transfers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No transfers yet. Move money between your own accounts — it is recorded as an out leg and an in
              leg so nothing is double-counted.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {t.fromAccountName} → {t.toAccountName}
                      {t.description ? <span className="font-normal text-slate-400"> · {t.description}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {new Date(t.transactionDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(t.amountMinor, t.currency)}</p>
                    <Button variant="ghost" size="sm" onClick={() => remove(t.id)} disabled={busyId !== null} loading={busyId === t.id}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-slate-500">
        Transfers only work between accounts in the same currency. Deleting a transfer removes both legs so
        your account balances stay consistent.
      </p>
    </div>
  );
}