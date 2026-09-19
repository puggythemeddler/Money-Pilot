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

export interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  kind: string;
}

export interface TransactionItem {
  id: string;
  kind: string;
  amountMinor: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  transactionDate: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  transferId: string | null;
}

export interface TransactionsManagerProps {
  items: TransactionItem[];
  total: number;
  accounts: AccountOption[];
  categories: CategoryOption[];
  filters: { kind?: string; accountId?: string; q?: string };
}

export function TransactionsManager({ items, total, accounts, categories, filters }: TransactionsManagerProps) {
  const router = useRouter();
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TransactionItem | null>(null);

  const kindCategories = categories.filter((c) => c.kind === kind);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body: Record<string, string> = {
      kind,
      accountId,
      amount: amount.trim(),
      transactionDate: date,
    };
    if (categoryId) body.categoryId = categoryId;
    if (description.trim()) body.description = description.trim();
    if (merchant.trim()) body.merchant = merchant.trim();
    try {
      await apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(body) });
      setAmount("");
      setDescription("");
      setMerchant("");
      setCategoryId("");
      setAccountId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save the transaction.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete the transaction.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setBusy(true);
    const payload: Record<string, string> = {
      amount: String(fromMinorUnits(Math.abs(editing.amountMinor), editing.currency === "UGX" ? "KES" : editing.currency)),
      transactionDate: editing.transactionDate.slice(0, 10),
    };
    if (editing.description?.trim()) payload.description = editing.description.trim();
    if (editing.merchant?.trim()) payload.merchant = editing.merchant.trim();
    if (editing.categoryId) payload.categoryId = editing.categoryId;
    try {
      await apiFetch(`/api/transactions/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the transaction.");
    } finally {
      setBusy(false);
    }
  }

  function setFilter(key: "kind" | "accountId" | "q", value: string) {
    const params = new URLSearchParams();
    const next = { ...filters, [key]: value };
    if (next.kind) params.set("kind", next.kind);
    if (next.accountId) params.set("account", next.accountId);
    if (next.q) params.set("q", next.q);
    const qs = params.toString();
    router.push(qs ? `/dashboard/transactions?${qs}` : "/dashboard/transactions");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Type" htmlFor="tx-kind">
              <Select
                id="tx-kind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as "EXPENSE" | "INCOME");
                  setCategoryId("");
                }}
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </Select>
            </Field>
            <Field label="Account" htmlFor="tx-account">
              <Select id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
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
            <Field label="Amount" htmlFor="tx-amount">
              <Input
                id="tx-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Date" htmlFor="tx-date">
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Category" htmlFor="tx-category">
              <Select id="tx-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" htmlFor="tx-description">
              <Input
                id="tx-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
              />
            </Field>
            <Field label="Merchant / payer" htmlFor="tx-merchant">
              <Input id="tx-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Optional" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Save transaction
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

      {editing ? (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-semibold text-slate-900">
              Edit {editing.kind.toLowerCase()} · {editing.accountName}
            </p>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Amount" htmlFor="tx-edit-amount">
                <Input
                  id="tx-edit-amount"
                  value={String(fromMinorUnits(Math.abs(editing.amountMinor), editing.currency))}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      amountMinor:
                        (editing.amountMinor < 0 ? -1 : 1) * parseMoneyToMinorUnits(e.target.value, editing.currency),
                    })
                  }
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Date" htmlFor="tx-edit-date">
                <Input
                  id="tx-edit-date"
                  type="date"
                  value={editing.transactionDate.slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, transactionDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="Description" htmlFor="tx-edit-description">
                <Input
                  id="tx-edit-description"
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Short description"
                />
              </Field>
              <Field label="Merchant / payer" htmlFor="tx-edit-merchant">
                <Input
                  id="tx-edit-merchant"
                  value={editing.merchant ?? ""}
                  onChange={(e) => setEditing({ ...editing, merchant: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Category" htmlFor="tx-edit-category">
                <Select
                  id="tx-edit-category"
                  value={editing.categoryId ?? ""}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {categories
                    .filter((c) => c.kind === editing.kind)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
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
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Filter by kind" htmlFor="f-kind">
            <Select id="f-kind" value={filters.kind ?? ""} onChange={(e) => setFilter("kind", e.target.value)}>
              <option value="">All kinds</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="TRANSFER">Transfers</option>
            </Select>
          </Field>
          <Field label="Account" htmlFor="f-account">
            <Select id="f-account" value={filters.accountId ?? ""} onChange={(e) => setFilter("accountId", e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search" htmlFor="f-q">
            <Input
              id="f-q"
              value={filters.q ?? ""}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Description or merchant"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            {total} {total === 1 ? "transaction" : "transactions"}
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No transactions match. Add your first entry above.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {t.description || (t.kind === "TRANSFER" ? "Transfer" : "Transaction")}
                        {t.merchant ? <span className="font-normal text-slate-400"> · {t.merchant}</span> : null}
                      </p>
                      {t.categoryName ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500"
                          style={{ background: `${t.categoryColor}1a` }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: t.categoryColor ?? "#94a3b8" }} aria-hidden="true" />
                          {t.categoryName}
                        </span>
                      ) : null}
                      {t.kind === "TRANSFER" ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Transfer</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t.accountName} ·{" "}
                      {new Date(t.transactionDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        t.amountMinor < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {t.amountMinor < 0 ? "−" : "+"}
                      {formatMoney(Math.abs(t.amountMinor), t.currency)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(t)}
                      disabled={t.kind === "TRANSFER" || busyId !== null || busy}
                      title={t.kind === "TRANSFER" ? "Edit transfers from the Transfers page" : "Edit this entry"}
                    >
                      {t.kind === "TRANSFER" ? "Via transfer" : "Edit"}
                    </Button>
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
        Delete an expense or income by removing its row. Transfer legs are edited from the Transfers page so
        the out leg and in leg always stay in sync.
      </p>
    </div>
  );
}