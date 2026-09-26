import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import type { CategoryRow } from "@/components/finance/CategoriesManager";
import { DebtsManager, type DebtItem } from "@/components/finance/DebtsManager";

export const metadata: Metadata = {
  title: "Debts",
  robots: { index: false, follow: false },
};

export default async function DebtsPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const [debts, categories] = await Promise.all([
    serverFetch<{ debts: DebtItem[] }>("/api/debts"),
    serverFetch<{ categories: CategoryRow[] }>("/api/categories"),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Debts</h1>
        <p className="text-sm text-slate-500">Track what you owe and how much of it is paid off.</p>
      </header>
      <DebtsManager
        debts={debts.debts}
        categories={categories.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
      />
    </div>
  );
}
