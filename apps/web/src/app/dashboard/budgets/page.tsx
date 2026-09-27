import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import type { CategoryRow } from "@/components/finance/CategoriesManager";
import { BudgetsManager, type BudgetItem } from "@/components/finance/BudgetsManager";

export const metadata: Metadata = {
  title: "Budgets",
  robots: { index: false, follow: false },
};

export default async function BudgetsPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const [budgets, categories] = await Promise.all([
    serverFetch<{ budgets: BudgetItem[] }>("/api/budgets"),
    serverFetch<{ categories: CategoryRow[] }>("/api/categories"),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Budgets</h1>
        <p className="text-sm text-muted">
          Give each month a limit and track spending against it automatically.
        </p>
      </header>
      <BudgetsManager
        budgets={budgets.budgets}
        categories={categories.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
      />
    </div>
  );
}
