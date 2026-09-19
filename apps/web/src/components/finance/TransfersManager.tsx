"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, fromMinorUnits, parseMoneyToMinorUnits } from "@moneypilot/shared";
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
  toAmountMinor: number;
  toCurrency: string;
  rate: string | null;
  description: string | null;
  notes: string | null;
  transactionDate: string;
}

function currencyOf(accounts: AccountOption[], id: string): string | undefined {
  return accounts.find((a) => a.id === id)?.currency;
}

export function TransfersManager({ transfers, accounts }: { transfers: TransferItem[]; accounts: AccountOption[] }) {
  const router = useRouter();
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TransferItem | null>(null);

  const fromCurrency = currencyOf(accounts, fromAccountId);
  const toCurrency = currencyOf(accounts, toAccountId);
  const crossCurrency = Boolean(fromCurrency && toCurrency && fromCurrency !== toCurrency);

  function resetForm() {
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
    setDescription("");
    setRate("");
    setDate(new Date().toISOString().slice(0, 10));
  }

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
    if (crossCurrency) body.rate = rate.trim();
    if (description.trim()) body.description = description.trim();
    try {
      await apiFetch("/api/transfers", { method: "POST", body: JSON.stringify(body) });
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setBusy(true);
    const payload: Record<string, string> = {
      amount: String(fromMinorUnits(editing.amountMinor, editing.currency === "UGX" ? "KES" : editing.currency)),
      transactionDate: editing.transactionDate.slice(0, 10),
    };
    if (editing.description?.trim()) payload.description = editing.description.trim();
    if (editing.notes?.trim()) payload.notes = editing.notes.trim();
    if (editing.currency !== editing.toCurrency && editing.rate?.trim()) payload.rate = editing.rate.trim();
    try {
      await apiFetch(`/api/transfers/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the transfer.");
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
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Move money
              </Button>
            </div>
            <Field label="Description" htmlFor="tr-description">
              <Input
                id="tr-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            {crossCurrency ? (
              <Field label={`Rate (1 ${fromCurrency} = ? ${toCurrency})`} htmlFor="tr-rate">
                <Input
                  id="tr-rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="e.g. 129.45"
                  inputMode="decimal"
                  required
                />
              </Field>
            ) : null}
          </form>
          {error ? (
            <div className="mt-4">
              <Alert variant="error">{error}</Alert>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-slate-900">
              Edit transfer · {editing.fromAccountName} → {editing.toAccountName}
            </p>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
<Field label="Amount" htmlFor="tr-edit-amount">
                  <Input
                    id="tr-edit-amount"
                    value={String(fromMinorUnits(editing.amountMinor, editing.currency))}
                    onChange={(e) =>
                      setEditing({ ...editing, amountMinor: parseMoneyToMinorUnits(e.target.value, editing.currency) })
                    }
                    inputMode="decimal"
                    required
                  />
                </Field>
              <Field label="Date" htmlFor="tr-edit-date">
                <Input
                  id="tr-edit-date"
                  type="date"
                  value={editing.transactionDate.slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, transactionDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="Description" htmlFor="tr-edit-description">
                <Input
                  id="tr-edit-description"
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
              {editing.currency !== editing.toCurrency ? (
                <Field label={`Rate (1 ${editing.currency} = ? ${editing.toCurrency})`} htmlFor="tr-edit-rate">
                  <Input
                    id="tr-edit-rate"
                    value={editing.rate ?? ""}
                    onChange={(e) => setEditing({ ...editing, rate: e.target.value })}
                    inputMode="decimal"
                  />
                </Field>
              ) : null}
              <Field label="Notes" htmlFor="tr-edit-notes">
                <Input
                  id="tr-edit-notes"
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit" loading={busy}>
                  Save changes
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

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
              {transfers.map((t) => {
                const isCross = t.currency !== t.toCurrency;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {t.fromAccountName} → {t.toAccountName}
                        {t.description ? <span className="font-normal text-slate-400"> · {t.description}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(t.transactionDate).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {isCross && t.rate ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-600">
                            1 {t.currency} = {t.rate} {t.toCurrency}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-right text-sm font-semibold tabular-nums text-slate-900">
                        {formatMoney(t.amountMinor, t.currency)}
                        {isCross ? (
                          <span className="block text-xs font-normal text-slate-400">
                            → {formatMoney(t.toAmountMinor, t.toCurrency)}
                          </span>
                        ) : null}
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(t)} disabled={busyId !== null || busy}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(t.id)} disabled={busyId !== null} loading={busyId === t.id}>
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-slate-500">
        Same-currency transfers need no rate. To move money between accounts in different currencies, give an
        exchange rate (1 unit of the source = X units of the destination); the destination leg is converted
        exactly and recorded in the destination account&apos;s own currency. Deleting a transfer removes both
        legs so your account balances stay consistent. Source and destination are fixed once a transfer
        exists — delete and re-create to move money elsewhere.
      </p>
    </div>
  );
}