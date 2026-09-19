import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { listCategories } from "@/lib/finance/categories";
import { listBudgets } from "@/lib/finance/budgets";
import { BudgetsManager } from "@/components/finance/BudgetsManager";

export const metadata: Metadata = {
  title: "Budgets",
  robots: { index: false, follow: false },
};

export default async function BudgetsPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const [budgets, categories] = await Promise.all([
    listBudgets(auth.user.id),
    listCategories(auth.user.id),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Budgets</h1>
        <p className="text-sm text-slate-500">
          Give each month a limit and track spending against it automatically.
        </p>
      </header>
      <BudgetsManager
        budgets={budgets}
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
      />
    </div>
  );
}