import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import type { AccountRow } from "@/components/finance/AccountsManager";
import type { CategoryRow } from "@/components/finance/CategoriesManager";
import { BillsManager, type BillItem } from "@/components/finance/BillsManager";

export const metadata: Metadata = {
  title: "Bills",
  robots: { index: false, follow: false },
};

export default async function BillsPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const [bills, categories, accounts] = await Promise.all([
    serverFetch<{ bills: BillItem[] }>("/api/bills"),
    serverFetch<{ categories: CategoryRow[] }>("/api/categories"),
    serverFetch<{ accounts: AccountRow[] }>("/api/accounts"),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Bills</h1>
        <p className="text-sm text-muted">Track recurring monthly bills and record payments in one tap.</p>
      </header>
      <BillsManager
        bills={bills.bills}
        categories={categories.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
        accounts={accounts.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}
