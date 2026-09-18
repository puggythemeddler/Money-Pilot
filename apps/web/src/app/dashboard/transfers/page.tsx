import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { listAccounts } from "@/lib/finance/accounts";
import { listTransfers } from "@/lib/finance/transfers";
import { TransfersManager } from "@/components/finance/TransfersManager";

export const metadata: Metadata = {
  title: "Transfers",
  robots: { index: false, follow: false },
};

export default async function TransfersPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const [transfers, accounts] = await Promise.all([
    listTransfers(auth.user.id),
    listAccounts(auth.user.id, false),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transfers</h1>
        <p className="text-sm text-slate-500">Moving money between your own accounts.</p>
      </header>
      <TransfersManager
        transfers={transfers}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}