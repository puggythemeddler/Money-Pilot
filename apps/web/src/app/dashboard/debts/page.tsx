import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { listCategories } from "@/lib/finance/categories";
import { listDebts } from "@/lib/finance/debts";
import { DebtsManager } from "@/components/finance/DebtsManager";

export const metadata: Metadata = {
  title: "Debts",
  robots: { index: false, follow: false },
};

export default async function DebtsPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const [debts, categories] = await Promise.all([
    listDebts(auth.user.id),
    listCategories(auth.user.id),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Debts</h1>
        <p className="text-sm text-slate-500">Track what you owe and how much of it is paid off.</p>
      </header>
      <DebtsManager
        debts={debts}
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
      />
    </div>
  );
}