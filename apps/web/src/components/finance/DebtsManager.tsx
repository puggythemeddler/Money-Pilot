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

export interface DebtItem {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  principalMinor: number;
  currency: string;
  interestRate: string | null;
  minimumPaymentMinor: number | null;
  dueDay: number | null;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  archived: boolean;
  paidMinor: number;
  balanceMinor: number;
}

const typeLabels: Record<string, string> = {
  LOAN: "Loan",
  CREDIT_CARD: "Credit card",
  MORTGAGE: "Mortgage",
  OTHER: "Other",
};

function todayISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function DebtsManager({
  debts,
  categories,
  accounts,
}: {
  debts: DebtItem[];
  categories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("LOAN");
  const [institution, setInstitution] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [interestRate, setInterestRate] = useState("");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [showCreate, setShowCreate] = useState(debts.length === 0);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DebtItem | null>(null);
  const [payTarget, setPayTarget] = useState<DebtItem | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payCategoryId, setPayCategoryId] = useState("");
  const [payDate, setPayDate] = useState("");

  const expenseCategories = categories.filter((c) => c.kind === "EXPENSE");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    const body: Record<string, string> = {
      name: name.trim(),
      type,
      principal: principal.trim(),
      currency,
    };
    if (institution.trim()) body.institution = institution.trim();
    if (categoryId) body.categoryId = categoryId;
    if (notes.trim()) body.notes = notes.trim();
    if (interestRate.trim()) body.interestRate = interestRate.trim();
    if (minimumPayment.trim()) body.minimumPayment = minimumPayment.trim();
    if (dueDay) body.dueDay = dueDay;
    try {
      await apiFetch("/api/debts", { method: "POST", body: JSON.stringify(body) });
      setName("");
      setInstitution("");
      setPrincipal("");
      setInterestRate("");
      setMinimumPayment("");
      setDueDay("");
      setCategoryId("");
      setNotes("");
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the debt.");
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
      principal: String(fromMinorUnits(editing.principalMinor, editing.currency)),
    };
    if (editing.name.trim()) payload.name = editing.name.trim();
    if (editing.type) payload.type = editing.type;
    if (editing.institution?.trim()) payload.institution = editing.institution.trim();
    if (editing.interestRate?.trim()) payload.interestRate = editing.interestRate.trim();
    if (editing.minimumPaymentMinor !== null && editing.minimumPaymentMinor > 0) {
      payload.minimumPayment = String(fromMinorUnits(editing.minimumPaymentMinor, editing.currency));
    }
    if (editing.dueDay !== null && editing.dueDay > 0) payload.dueDay = String(editing.dueDay);
    if (editing.categoryId) payload.categoryId = editing.categoryId;
    if (editing.notes?.trim()) payload.notes = editing.notes.trim();
    try {
      await apiFetch(`/api/debts/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the debt.");
    } finally {
      setBusy(false);
    }
  }

  function openPay(d: DebtItem) {
    setError(null);
    setSuccess(null);
    setPayTarget(d);
    setPayAccountId(accounts.find((a) => a.currency === d.currency)?.id ?? accounts[0]?.id ?? "");
    const suggested = d.balanceMinor > 0 ? d.balanceMinor : d.minimumPaymentMinor ?? 0;
    setPayAmount(suggested > 0 ? String(fromMinorUnits(suggested, d.currency)) : "");
    setPayCategoryId(d.categoryId ?? "");
    setPayDate(todayISO());
  }

  async function payDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    setError(null);
    setSuccess(null);
    const account = accounts.find((a) => a.id === payAccountId);
    if (!account) {
      setError("Choose the account the payment comes from.");
      return;
    }
    if (account.currency !== payTarget.currency) {
      setError(
        `This debt is in ${payTarget.currency} but ${account.name} is in ${account.currency}. Pick an account in ${payTarget.currency}.`,
      );
      return;
    }
    setBusy(true);
    const payee = payTarget.institution?.trim() || payTarget.name;
    try {
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind: "EXPENSE",
          debtId: payTarget.id,
          accountId: payAccountId,
          amount: payAmount.trim(),
          transactionDate: payDate || todayISO(),
          ...(payCategoryId ? { categoryId: payCategoryId } : {}),
          merchant: payee,
          description: `Payment to ${payee}`,
        }),
      });
      setPayTarget(null);
      setPayAccountId("");
      setPayAmount("");
      setPayCategoryId("");
      setPayDate("");
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setError(null);
    setSuccess(null);
    setBusyId(id);
    try {
      await apiFetch(`/api/debts/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not archive the debt.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}
      <Alert title="Payments are linked to individual debts">
        Older expenses tagged with a debt category are unallocated until you choose their creditor.
        Open Transactions, edit the repayment, and choose Payment for debt. Your account balances are unchanged.
      </Alert>
      <details open={showCreate} onToggle={(e) => setShowCreate(e.currentTarget.open)} className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold text-primary-700 dark:text-primary-300">Add debt</summary>
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name" htmlFor="dt-name">
              <Input id="dt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HELB loan" required />
            </Field>
            <Field label="Type" htmlFor="dt-type">
              <Select id="dt-type" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Institution" htmlFor="dt-institution">
              <Input id="dt-institution" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Principal owed" htmlFor="dt-principal">
              <Input id="dt-principal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0.00" inputMode="decimal" required />
            </Field>
            <Field label="Currency" htmlFor="dt-currency">
              <Select id="dt-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Object.values(CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Annual interest (%)" htmlFor="dt-interest">
              <Input id="dt-interest" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="e.g. 13.5" inputMode="decimal" />
            </Field>
            <Field label="Min. payment" htmlFor="dt-minimum">
              <Input id="dt-minimum" value={minimumPayment} onChange={(e) => setMinimumPayment(e.target.value)} placeholder="Optional" inputMode="decimal" />
            </Field>
            <Field label="Due day (1-31)" htmlFor="dt-day">
              <Input id="dt-day" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="e.g. 5" inputMode="numeric" />
            </Field>
            <Field label="Payments category" htmlFor="dt-category">
              <Select id="dt-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="dt-notes">
              <Input id="dt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Add debt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </details>

      {editing ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-heading">Edit debt · {editing.name}</p>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" htmlFor="dt-edit-name">
                <Input id="dt-edit-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
              </Field>
              <Field label="Principal owed" htmlFor="dt-edit-principal">
                <Input
                  id="dt-edit-principal"
                  value={String(fromMinorUnits(editing.principalMinor, editing.currency))}
                  onChange={(e) => setEditing({ ...editing, principalMinor: parseMoneyToMinorUnits(e.target.value, editing.currency) })}
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Institution" htmlFor="dt-edit-institution">
                <Input id="dt-edit-institution" value={editing.institution ?? ""} onChange={(e) => setEditing({ ...editing, institution: e.target.value })} />
              </Field>
              <Field label="Interest (%)" htmlFor="dt-edit-interest">
                <Input id="dt-edit-interest" value={editing.interestRate ?? ""} onChange={(e) => setEditing({ ...editing, interestRate: e.target.value })} />
              </Field>
              <Field label="Min. payment" htmlFor="dt-edit-minimum">
                <Input
                  id="dt-edit-minimum"
                  value={editing.minimumPaymentMinor !== null ? fromMinorUnits(editing.minimumPaymentMinor, editing.currency) : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditing({
                      ...editing,
                      minimumPaymentMinor: value === "" ? null : parseMoneyToMinorUnits(value, editing.currency),
                    });
                  }}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Due day" htmlFor="dt-edit-day">
                <Input
                  id="dt-edit-day"
                  value={editing.dueDay ?? ""}
                  onChange={(e) => setEditing({ ...editing, dueDay: e.target.value === "" ? null : Number(e.target.value) })}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Payments category" htmlFor="dt-edit-category">
                <Select
                  id="dt-edit-category"
                  value={editing.categoryId ?? ""}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value || null })}
                >
                  <option value="">None</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="dt-edit-notes">
                <Input id="dt-edit-notes" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
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

      {payTarget ? (
        <Card>
          <CardContent>
            <p className="text-sm font-semibold text-heading">Pay {payTarget.name}</p>
            <p className="mb-3 mt-0.5 text-xs text-faint">
              Payment goes to{" "}
              <span className="font-semibold text-body">
                {payTarget.institution?.trim() || payTarget.name}
              </span>{" "}
              · remaining {formatMoney(Math.max(0, payTarget.balanceMinor), payTarget.currency)}
            </p>
            <form onSubmit={payDebt} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Amount" htmlFor="dt-pay-amount">
                <Input
                  id="dt-pay-amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Pay from account" htmlFor="dt-pay-account">
                <Select id="dt-pay-account" value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)} required>
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
              <Field label="Payments category" htmlFor="dt-pay-category">
                <Select id="dt-pay-category" value={payCategoryId} onChange={(e) => setPayCategoryId(e.target.value)}>
                  <option value="">No category (optional)</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="dt-pay-date">
                <Input id="dt-pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
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
            <p className="mt-2 text-xs text-faint">
              This records a real expense named “Payment to {payTarget.institution?.trim() || payTarget.name}” on the
              account you choose; it counts against this debt as soon as it is saved.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <p className="border-b border-line px-4 py-3 text-sm font-semibold text-heading">
          {debts.length} {debts.length === 1 ? "debt" : "debts"}
        </p>
        <CardContent className="p-0">
          {debts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              No debts tracked yet. Add what you owe to see your remaining balance — payments are linked to each debt, not inferred from
              your expenses automatically.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {debts.map((d) => {
                const remainingPct = d.principalMinor > 0 ? Math.max(0, Math.min(100, (d.balanceMinor / d.principalMinor) * 100)) : 0;
                return (
                  <li key={d.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-heading">
                          {d.name}
                          <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                            {typeLabels[d.type] ?? d.type}
                          </span>
                          {d.institution ? <span className="font-normal text-faint"> · {d.institution}</span> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-faint">
                          {d.interestRate ? <span>{d.interestRate}% annual · </span> : null}
                          {d.dueDay ? <span>due day {d.dueDay} · </span> : null}
                          {d.categoryName ? <span>category: {d.categoryName}</span> : <span>no payments category</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <p className="text-right text-sm font-semibold tabular-nums text-heading">
                          {formatMoney(Math.max(0, d.balanceMinor), d.currency)}
                          <span className="block text-xs font-normal text-faint">
                            paid {formatMoney(d.paidMinor, d.currency)} of {formatMoney(d.principalMinor, d.currency)}
                          </span>
                        </p>
                        {d.balanceMinor > 0 ? (
                          <Button variant="outline" size="sm" onClick={() => openPay(d)}>
                            Pay
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => archive(d.id)} disabled={busyId !== null} loading={busyId === d.id}>
                          Archive
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-heading" style={{ width: `${remainingPct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted">
        Debts are tracked, not traded: your remaining balance is principal minus what you&apos;ve paid. Use{" "}
        <span className="font-medium text-body">Pay</span> to record a payment — it creates a real expense named after
        the creditor on the account you choose, and counts only against that debt. Older category-only expenses can be assigned from Transactions.
      </p>
    </div>
  );
}
