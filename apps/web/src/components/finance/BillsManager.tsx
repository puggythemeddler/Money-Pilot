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
import type { AccountOption, CategoryOption } from "./TransactionsManager";

export interface BillItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  dueDay: number;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  paidFor: string | null;
  paidMinor: number;
}

export function BillsManager({
  bills,
  categories,
  accounts,
}: {
  bills: BillItem[];
  categories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [dueDay, setDueDay] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillItem | null>(null);
  const [payTarget, setPayTarget] = useState<BillItem | null>(null);
  const [payAccountId, setPayAccountId] = useState("");

  const expenseCategories = categories.filter((c) => c.kind === "EXPENSE");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body: Record<string, string> = {
      name: name.trim(),
      amount: amount.trim(),
      currency,
      dueDay,
    };
    if (categoryId) body.categoryId = categoryId;
    if (notes.trim()) body.notes = notes.trim();
    try {
      await apiFetch("/api/bills", { method: "POST", body: JSON.stringify(body) });
      setName("");
      setAmount("");
      setNotes("");
      setCategoryId("");
      setDueDay("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the bill.");
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
      dueDay: String(editing.dueDay),
    };
    if (editing.name.trim()) payload.name = editing.name.trim();
    if (editing.categoryId) payload.categoryId = editing.categoryId;
    if (editing.notes?.trim()) payload.notes = editing.notes.trim();
    try {
      await apiFetch(`/api/bills/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the bill.");
    } finally {
      setBusy(false);
    }
  }

  async function payBill(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/bills/${payTarget.id}`, {
        method: "POST",
        body: JSON.stringify({ accountId: payAccountId }),
      });
      setPayTarget(null);
      setPayAccountId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await apiFetch(`/api/bills/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not archive the bill.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Name" htmlFor="bl-name">
              <Input id="bl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" required />
            </Field>
            <Field label="Amount" htmlFor="bl-amount">
              <Input id="bl-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" required />
            </Field>
            <Field label="Currency" htmlFor="bl-currency">
              <Select id="bl-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </Field>
            <Field label="Due day of month" htmlFor="bl-day">
              <Input id="bl-day" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="e.g. 5" inputMode="numeric" required />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Add bill
              </Button>
            </div>
            <Field label="Category" htmlFor="bl-category">
              <Select id="bl-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="bl-notes">
              <Input id="bl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
          </form>
          {error ? (
            <div className="mt-4">
              <Alert variant="error">{error}</Alert>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {payTarget ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-slate-900">
              Pay {payTarget.name} · {formatMoney(payTarget.amountMinor, payTarget.currency)}
            </p>
            <form onSubmit={payBill} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Pay from account" htmlFor="bl-pay-account">
                <Select id="bl-pay-account" value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)} required>
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
              <div className="flex items-end gap-2">
                <Button type="submit" loading={busy}>
                  Record payment
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPayTarget(null)}>
                  Cancel
                </Button>
              </div>
            </form>
            <p className="mt-2 text-xs text-slate-400">
              Recording a payment creates a real expense for this month on that account and marks the bill paid.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-slate-900">Edit bill · {editing.name}</p>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" htmlFor="bl-edit-name">
                <Input id="bl-edit-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
              </Field>
              <Field label="Amount" htmlFor="bl-edit-amount">
                <Input
                  id="bl-edit-amount"
                  value={String(fromMinorUnits(editing.amountMinor, editing.currency))}
                  onChange={(e) => setEditing({ ...editing, amountMinor: parseMoneyToMinorUnits(e.target.value, editing.currency) })}
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Due day" htmlFor="bl-edit-day">
                <Input
                  id="bl-edit-day"
                  value={String(editing.dueDay)}
                  onChange={(e) => setEditing({ ...editing, dueDay: Number(e.target.value) })}
                  inputMode="numeric"
                  required
                />
              </Field>
              <Field label="Category" htmlFor="bl-edit-category">
                <Select
                  id="bl-edit-category"
                  value={editing.categoryId ?? ""}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="bl-edit-notes">
                <Input id="bl-edit-notes" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
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
          {bills.length} {bills.length === 1 ? "bill" : "bills"}
        </p>
        <CardContent className="p-0">
          {bills.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No bills yet. Add your recurring monthly obligations so paying them is one tap — each payment is a
              real expense on your accounts.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bills.map((b) => {
                const paidThisMonth = b.paidFor !== null && b.paidMinor > 0;
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {b.name}
                        {b.categoryName ? <span className="font-normal text-slate-400"> · {b.categoryName}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        due day {b.dueDay} ·{" "}
                        {paidThisMonth ? (
                          <span className="font-medium text-emerald-600">paid for {b.paidFor}</span>
                        ) : (
                          <span className="text-amber-600">not paid this month</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatMoney(b.amountMinor, b.currency)}
                      </p>
                      {!paidThisMonth ? (
                        <Button variant="outline" size="sm" onClick={() => setPayTarget(b)}>
                          Mark paid
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => archive(b.id)} disabled={busyId !== null} loading={busyId === b.id}>
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

      <p className="text-sm text-slate-500">
        Bills are monthly. “Mark paid” records a real EXPENSE on the account you choose (in the bill&apos;s
        currency), links it to this bill and month, and updates your balances and budgets — so a paid bill is a
        genuine money movement.
      </p>
    </div>
  );
}