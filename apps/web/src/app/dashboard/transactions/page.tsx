import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { transactionQuerySchema } from "@moneypilot/shared";
import { getAuthContext } from "@/lib/auth";
import { listAccounts } from "@/lib/finance/accounts";
import { listCategories } from "@/lib/finance/categories";
import { listTransactions } from "@/lib/finance/transactions";
import { TransactionsManager } from "@/components/finance/TransactionsManager";

export const metadata: Metadata = {
  title: "Transactions",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ kind?: string; account?: string; q?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const sp = await searchParams;
  const parsed = transactionQuerySchema.safeParse({
    kind: sp.kind,
    accountId: sp.account,
    q: sp.q,
  });
  const query = parsed.success ? parsed.data : transactionQuerySchema.parse({});

  const [result, accounts, categories] = await Promise.all([
    listTransactions(auth.user.id, query),
    listAccounts(auth.user.id, false),
    listCategories(auth.user.id, {}),
  ]);

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500">Every expense, income and transfer leg, in one place.</p>
      </header>
      <TransactionsManager
        items={result.items}
        total={result.pagination.total}
        accounts={accountOptions}
        categories={categoryOptions}
        filters={{ kind: query.kind, accountId: query.accountId, q: query.q }}
      />
    </div>
  );
}