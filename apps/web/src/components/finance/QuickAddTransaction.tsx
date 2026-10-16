"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";

/**
 * Fast expense/income entry: one row (amount + account + optional category and
 * note) that posts straight to the API and refreshes the server-rendered
 * summary. Used both inside the first-run guide and, once the user has an
 * account, as the everyday quick-add on the dashboard.
 */

export interface QuickAddAccount {
  id: string;
  name: string;
  currency: string;
}

interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  color: string;
  archived: boolean;
}

type Kind = "EXPENSE" | "INCOME";

function todayISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function QuickAddTransaction({
  accounts,
  currency,
  className,
}: {
  accounts: QuickAddAccount[];
  currency: string;
  className?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ categories: CategoryRow[] }>("/api/categories")
      .then((res) => {
        if (active) setCategories(res.categories.filter((c) => !c.archived));
      })
      .catch(() => {
        // Category choice is optional; quick entry still works without it.
      });
    return () => {
      active = false;
    };
  }, []);

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  useEffect(() => {
    if (categoryId && !categoryOptions.some((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [categoryOptions, categoryId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    if (!accountId) {
      setError("Add an account first.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind,
          accountId,
          amount: amount.trim(),
          transactionDate: todayISO(),
          ...(categoryId ? { categoryId } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      setAmount("");
      setDescription("");
      setCategoryId("");
      setSaved(kind === "EXPENSE" ? "Expense recorded." : "Income recorded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record the transaction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={className} noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Type" htmlFor="quick-kind">
          <Select
            id="quick-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </Select>
        </Field>
        <Field label={`Amount (${currency})`} htmlFor="quick-amount">
          <Input
            id="quick-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
          />
        </Field>
        <Field label="Account" htmlFor="quick-account">
          <Select
            id="quick-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="quick-category" hint="Optional">
          <Select
            id="quick-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">No category</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="quick-description" hint="Optional">
          <Input
            id="quick-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Matatu fare"
            maxLength={140}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          {kind === "EXPENSE" ? "Add expense" : "Add income"}
        </Button>
        {saved ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status">
            {saved}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
