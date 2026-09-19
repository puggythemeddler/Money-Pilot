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
import type { CategoryOption } from "./TransactionsManager";

export interface BudgetItem {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  period: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  spentMinor: number;
  remainingMinor: number;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function BudgetsManager({ budgets, categories }: { budgets: BudgetItem[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [period, setPeriod] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetItem | null>(null);

  const expenseCategories = categories.filter((c) => c.kind === "EXPENSE");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body: Record<string, string> = {
      name: name.trim(),
      amount: amount.trim(),
      currency,
      period,
    };
    if (!isGlobal && categoryId) body.categoryId = categoryId;
    if (notes.trim()) body.notes = notes.trim();
    try {
      await apiFetch("/api/budgets", { method: "POST", body: JSON.stringify(body) });
      setName("");
      setAmount("");
      setNotes("");
      setCategoryId("");
      setIsGlobal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the budget.");
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
      amount: String(fromMinorUnits(editing.amountMinor, editing.currency)),
    };
    if (editing.name.trim()) payload.name = editing.name.trim();
    if (editing.notes?.trim()) payload.notes = editing.notes.trim();
    try {
      await apiFetch(`/api/budgets/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the budget.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await apiFetch(`/api/budgets/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not archive the budget.");
    } finally {
      setBusyId(null);
    }
  }

  const progress = (b: BudgetItem) =>
    b.amountMinor > 0 ? Math.min(100, Math.round((b.spentMinor / b.amountMinor) * 100)) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Name" htmlFor="bd-name">
              <Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" required />
            </Field>
            <Field label="Monthly limit" htmlFor="bd-amount">
              <Input id="bd-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" required />
            </Field>
            <Field label="Currency" htmlFor="bd-currency">
              <Select id="bd-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </Field>
            <Field label="Period (YYYY-MM)" htmlFor="bd-period">
              <Input id="bd-period" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-09" required />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Create budget
              </Button>
            </div>
            <Field label="Scoped to category" htmlFor="bd-category">
              <Select
                id="bd-category"
                value={isGlobal ? "global" : categoryId}
                onChange={(e) => {
                  if (e.target.value === "global") {
                    setIsGlobal(true);
                    setCategoryId("");
                  } else {
                    setIsGlobal(false);
                    setCategoryId(e.target.value);
                  }
                }}
              >
                <option value="global">Whole month (all spending)</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="bd-notes">
              <Input id="bd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
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
            <p className="mb-3 text-sm font-semibold text-slate-900">Edit budget · {editing.name}</p>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" htmlFor="bd-edit-name">
                <Input
                  id="bd-edit-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Monthly limit" htmlFor="bd-edit-amount">
                <Input
                  id="bd-edit-amount"
                  value={String(fromMinorUnits(editing.amountMinor, editing.currency))}
                  onChange={(e) => setEditing({ ...editing, amountMinor: parseMoneyToMinorUnits(e.target.value, editing.currency) })}
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Notes" htmlFor="bd-edit-notes">
                <Input id="bd-edit-notes" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit" loading={busy}>
                  Save
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
          {budgets.length} {budgets.length === 1 ? "budget" : "budgets"}
        </p>
        <CardContent className="p-0">
          {budgets.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No budgets yet. Give each month a limit — per category or for everything — and your spending is
              tracked against it automatically.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {budgets.map((b) => {
                const pct = progress(b);
                const over = b.spentMinor > b.amountMinor;
                return (
                  <li key={b.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {b.name}
                          {b.categoryName ? <span className="font-normal text-slate-400"> · {b.categoryName}</span> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">Period {b.period}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <p className="text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatMoney(b.spentMinor, b.currency)}
                          <span className="block text-xs font-normal text-slate-400">
                            of {formatMoney(b.amountMinor, b.currency)} · {over ? "over by " : "left "}
                            {formatMoney(over ? -b.remainingMinor : b.remainingMinor, b.currency)}
                          </span>
                        </p>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => archive(b.id)} disabled={busyId !== null} loading={busyId === b.id}>
                          Archive
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${over ? "bg-red-500" : "bg-teal-600"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-slate-500">
        Spent is derived from your EXPENSE transactions for the period in the budget&apos;s currency — it is
        never stored, so the transaction log stays the single source of truth. A budget with no category covers
        the whole month. Archive finishes a budget; archived budgets stop appearing but keep their history.
      </p>
    </div>
  );
}