import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import type { AccountRow } from "@/components/finance/AccountsManager";
import type { CategoryRow } from "@/components/finance/CategoriesManager";
import {
  RecurringIncomeManager,
  type RecurringIncomeItem,
} from "@/components/finance/RecurringIncomeManager";

export const metadata: Metadata = {
  title: "Income",
  robots: { index: false, follow: false },
};

export default async function IncomePage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const [incomes, categories, accounts] = await Promise.all([
    serverFetch<{ incomes: RecurringIncomeItem[] }>("/api/recurring-income"),
    serverFetch<{ categories: CategoryRow[] }>("/api/categories"),
    serverFetch<{ accounts: AccountRow[] }>("/api/accounts"),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Income</h1>
        <p className="text-sm text-muted">
          Track salary and other recurring income, and record each month as a real deposit.
        </p>
      </header>
      <RecurringIncomeManager
        incomes={incomes.incomes}
        categories={categories.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
        accounts={accounts.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}
