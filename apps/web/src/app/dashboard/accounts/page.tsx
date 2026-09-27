import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import { AccountsManager, type AccountRow } from "@/components/finance/AccountsManager";

export const metadata: Metadata = {
  title: "Accounts",
  robots: { index: false, follow: false },
};

export default async function AccountsPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const { accounts } = await serverFetch<{ accounts: AccountRow[] }>("/api/accounts?archived=true");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Accounts</h1>
        <p className="text-sm text-muted">
          Where your money lives: cash, M-Pesa, bank and credit accounts.
        </p>
      </header>
      <AccountsManager accounts={accounts} />
    </div>
  );
}
