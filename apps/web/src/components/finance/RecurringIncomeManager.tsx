"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES, formatMoney, fromMinorUnits, parseMoneyToMinorUnits } from "@moneypilot/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import type { AccountOption, CategoryOption } from "./TransactionsManager";

export interface RecurringIncomeItem {
  id: string;
  name: string;
  payee: string | null;
  amountMinor: number;
  currency: string;
  payDay: number;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  receivedFor: string | null;
  receivedMinor: number;
}

export function RecurringIncomeManager({
  incomes,
  categories,
  accounts,
}: {
  incomes: RecurringIncomeItem[];
  categories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [payDay, setPayDay] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [showCreate, setShowCreate] = useState(incomes.length === 0);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurringIncomeItem | null>(null);
  const [recordTarget, setRecordTarget] = useState<RecurringIncomeItem | null>(null);
  const [recordAccountId, setRecordAccountId] = useState("");
  const [recordDate, setRecordDate] = useState("");

  const incomeCategories = categories.filter((c) => c.kind === "INCOME");

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function openRecord(i: RecurringIncomeItem) {
    setError(null);
    setSuccess(null);
    setRecordTarget(i);
    setRecordAccountId(accounts.find((a) => a.currency === i.currency)?.id ?? accounts[0]?.id ?? "");
    setRecordDate(todayISO());
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    const body: Record<string, string> = {
      name: name.trim(),
      amount: amount.trim(),
      currency,
      payDay,
    };
    if (payee.trim()) body.payee = payee.trim();
    if (categoryId) body.categoryId = categoryId;
    if (notes.trim()) body.notes = notes.trim();
    try {
      await apiFetch("/api/recurring-income", { method: "POST", body: JSON.stringify(body) });
      setName("");
      setPayee("");
      setAmount("");
      setNotes("");
      setCategoryId("");
      setPayDay("");
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the income.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    const payload: Record<string, string> = {
      amount: String(fromMinorUnits(editing.amountMinor, editing.currency)),
      payDay: String(editing.payDay),
    };
    if (editing.name.trim()) payload.name = editing.name.trim();
    if (editing.payee?.trim()) payload.payee = editing.payee.trim();
    if (editing.categoryId) payload.categoryId = editing.categoryId;
    if (editing.notes?.trim()) payload.notes = editing.notes.trim();
    try {
      await apiFetch(`/api/recurring-income/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditing(null);
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the income.");
    } finally {
      setBusy(false);
    }
  }

  async function recordIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!recordTarget) return;
    const account = accounts.find((a) => a.id === recordAccountId);
    if (account && account.currency !== recordTarget.currency) {
      setError(
        `This income is in ${recordTarget.currency} but ${account.name} is in ${account.currency}. Pick an account in ${recordTarget.currency}.`,
      );
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await apiFetch(`/api/recurring-income/${recordTarget.id}`, {
        method: "POST",
        body: JSON.stringify({
          accountId: recordAccountId,
          ...(recordDate ? { transactionDate: recordDate } : {}),
        }),
      });
      setRecordTarget(null);
      setRecordAccountId("");
      setRecordDate("");
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record the income.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setError(null);
    setSuccess(null);
    setBusyId(id);
    try {
      await apiFetch(`/api/recurring-income/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: true }),
      });
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not archive the income.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}
      <details open={showCreate} onToggle={(e) => setShowCreate(e.currentTarget.open)} className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold text-primary-700 dark:text-primary-300">Add income</summary>
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Name" htmlFor="ri-name">
              <Input
                id="ri-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monthly salary"
                required
              />
            </Field>
            <Field label="Paid by (optional)" htmlFor="ri-payee">
              <Input
                id="ri-payee"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="e.g. Acme Ltd"
              />
            </Field>
            <Field label="Amount" htmlFor="ri-amount">
              <Input
                id="ri-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Currency" htmlFor="ri-currency">
              <Select id="ri-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Object.values(CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Day of month" htmlFor="ri-day">
              <Input
                id="ri-day"
                value={payDay}
                onChange={(e) => setPayDay(e.target.value)}
                placeholder="e.g. 28"
                inputMode="numeric"
                required
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Add income
              </Button>
            </div>
            <Field label="Category" htmlFor="ri-category">
              <Select id="ri-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {incomeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="ri-notes">
              <Input id="ri-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
          </form>
        </CardContent>
      </Card>
      </details>

      {recordTarget ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-heading">
              Record {recordTarget.name}
              {recordTarget.payee ? ` from ${recordTarget.payee}` : ""} ·{" "}
              {formatMoney(recordTarget.amountMinor, recordTarget.currency)}
            </p>
            <form onSubmit={recordIncome} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Deposit to account" htmlFor="ri-record-account">
                <Select
                  id="ri-record-account"
                  value={recordAccountId}
                  onChange={(e) => setRecordAccountId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select account
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date (optional)" htmlFor="ri-record-date">
                <Input
                  id="ri-record-date"
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit" loading={busy}>
                  Record income
                </Button>
                <Button type="button" variant="ghost" onClick={() => setRecordTarget(null)}>
                  Cancel
                </Button>
              </div>
            </form>
            <p className="mt-2 text-xs text-faint">
              Recording creates a real INCOME transaction for this month on the account you choose, so the money
              genuinely lands in your balance.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-heading">Edit income · {editing.name}</p>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" htmlFor="ri-edit-name">
                <Input
                  id="ri-edit-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Paid by" htmlFor="ri-edit-payee">
                <Input
                  id="ri-edit-payee"
                  value={editing.payee ?? ""}
                  onChange={(e) => setEditing({ ...editing, payee: e.target.value })}
                />
              </Field>
              <Field label="Amount" htmlFor="ri-edit-amount">
                <Input
                  id="ri-edit-amount"
                  value={String(fromMinorUnits(editing.amountMinor, editing.currency))}
                  onChange={(e) =>
                    setEditing({ ...editing, amountMinor: parseMoneyToMinorUnits(e.target.value, editing.currency) })
                  }
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Day of month" htmlFor="ri-edit-day">
                <Input
                  id="ri-edit-day"
                  value={String(editing.payDay)}
                  onChange={(e) => setEditing({ ...editing, payDay: Number(e.target.value) })}
                  inputMode="numeric"
                  required
                />
              </Field>
              <Field label="Category" htmlFor="ri-edit-category">
                <Select
                  id="ri-edit-category"
                  value={editing.categoryId ?? ""}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {incomeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="ri-edit-notes">
                <Input
                  id="ri-edit-notes"
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
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
        <p className="border-b border-line px-4 py-3 text-sm font-semibold text-heading">
          {incomes.length} {incomes.length === 1 ? "income" : "incomes"}
        </p>
        <CardContent className="p-0">
          {incomes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              No recurring incomes yet. Add your salary or other regular income so recording a month is one tap —
              each record is a real deposit on your accounts.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {incomes.map((i) => {
                const receivedThisMonth = i.receivedFor !== null && i.receivedMinor > 0;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-heading">
                        {i.name}
                        {i.payee ? <span className="font-normal text-faint"> · {i.payee}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        day {i.payDay}
                        {i.categoryName ? <> · {i.categoryName}</> : null} ·{" "}
                        {receivedThisMonth ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            received for {i.receivedFor}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">not received this month</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-sm font-semibold tabular-nums text-heading">
                        {formatMoney(i.amountMinor, i.currency)}
                      </p>
                      {!receivedThisMonth ? (
                        <Button variant="outline" size="sm" onClick={() => openRecord(i)}>
                          Record
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(i)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archive(i.id)}
                        disabled={busyId !== null}
                        loading={busyId === i.id}
                      >
                        Archive
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted">
        Income is monthly. “Record” creates a real INCOME transaction on the account you choose (in the income&apos;s
        currency), links it to this income and month, and updates your balances — so a recorded month is a genuine
        money movement, not a status flag.
      </p>
    </div>
  );
}
