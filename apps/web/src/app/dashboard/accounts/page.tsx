import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { listAccounts } from "@/lib/finance/accounts";
import { AccountsManager } from "@/components/finance/AccountsManager";

export const metadata: Metadata = {
  title: "Accounts",
  robots: { index: false, follow: false },
};

export default async function AccountsPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const accounts = await listAccounts(auth.user.id, true);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Accounts</h1>
        <p className="text-sm text-slate-500">
          Where your money lives: cash, M-Pesa, bank and credit accounts.
        </p>
      </header>
      <AccountsManager accounts={accounts} />
    </div>
  );
}