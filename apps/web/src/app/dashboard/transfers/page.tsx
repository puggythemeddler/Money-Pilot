import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import type { AccountRow } from "@/components/finance/AccountsManager";
import { TransfersManager, type TransferItem } from "@/components/finance/TransfersManager";

export const metadata: Metadata = {
  title: "Transfers",
  robots: { index: false, follow: false },
};

export default async function TransfersPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const [transfers, accounts] = await Promise.all([
    serverFetch<{ transfers: TransferItem[] }>("/api/transfers"),
    serverFetch<{ accounts: AccountRow[] }>("/api/accounts"),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transfers</h1>
        <p className="text-sm text-slate-500">Moving money between your own accounts.</p>
      </header>
      <TransfersManager
        transfers={transfers.transfers}
        accounts={accounts.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}
