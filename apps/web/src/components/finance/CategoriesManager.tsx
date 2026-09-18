"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLOR_PRESETS } from "@moneypilot/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  color: string;
  archived: boolean;
  transactionCount: number;
}

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [color, setColor] = useState<string>(COLOR_PRESETS[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = {
    EXPENSE: categories.filter((c) => c.kind === "EXPENSE"),
    INCOME: categories.filter((c) => c.kind === "INCOME"),
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), kind, color }),
      });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the category.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchived(row: CategoryRow) {
    setError(null);
    setBusyId(row.id);
    try {
      await apiFetch(`/api/categories/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !row.archived }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the category.");
    } finally {
      setBusyId(null);
    }
  }

  function list(rows: CategoryRow[]) {
    return (
      <ul className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <li className="px-4 py-3 text-sm text-slate-500">None yet.</li>
        ) : (
          rows.map((row) => (
            <li
              key={row.id}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 ${row.archived ? "opacity-60" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
                <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                {row.archived ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Archived
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-slate-400">
                  {row.transactionCount} {row.transactionCount === 1 ? "transaction" : "transactions"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => toggleArchived(row)} disabled={busyId !== null} loading={busyId === row.id}>
                  {row.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Category name" htmlFor="cat-name">
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" required />
            </Field>
            <Field label="Kind" htmlFor="cat-kind">
              <Select id="cat-kind" value={kind} onChange={(e) => setKind(e.target.value as "INCOME" | "EXPENSE")}>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </Select>
            </Field>
            <div>
              <p className="mb-1.5 block text-sm font-medium text-slate-700">Colour</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full transition-transform",
                      color === c ? "ring-2 ring-slate-900 ring-offset-2" : "hover:scale-110",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Add category
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Expenses</p>
          <CardContent className="p-0">{list(grouped.EXPENSE)}</CardContent>
        </Card>
        <Card>
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Income</p>
          <CardContent className="p-0">{list(grouped.INCOME)}</CardContent>
        </Card>
      </div>

      <p className="text-sm text-slate-500">
        Categories are shared across expenses and income but the kind controls where they appear.
        Archiving keeps history intact.
      </p>
    </div>
  );
}