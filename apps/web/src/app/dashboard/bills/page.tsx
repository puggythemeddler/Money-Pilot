import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { listAccounts } from "@/lib/finance/accounts";
import { listCategories } from "@/lib/finance/categories";
import { listBills } from "@/lib/finance/bills";
import { BillsManager } from "@/components/finance/BillsManager";

export const metadata: Metadata = {
  title: "Bills",
  robots: { index: false, follow: false },
};

export default async function BillsPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const [bills, categories, accounts] = await Promise.all([
    listBills(auth.user.id),
    listCategories(auth.user.id),
    listAccounts(auth.user.id, false),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bills</h1>
        <p className="text-sm text-slate-500">Track recurring monthly bills and record payments in one tap.</p>
      </header>
      <BillsManager
        bills={bills}
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}