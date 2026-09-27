import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { transactionQuerySchema } from "@moneypilot/shared";
import { getServerUser, serverFetch } from "@/lib/server-api";
import type { AccountRow } from "@/components/finance/AccountsManager";
import type { CategoryRow } from "@/components/finance/CategoriesManager";
import {
  TransactionsManager,
  type TransactionItem,
} from "@/components/finance/TransactionsManager";

export const metadata: Metadata = {
  title: "Transactions",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ kind?: string; account?: string; q?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const sp = await searchParams;
  const parsed = transactionQuerySchema.safeParse({
    kind: sp.kind,
    accountId: sp.account,
    q: sp.q,
  });
  const query = parsed.success ? parsed.data : transactionQuerySchema.parse({});

  const params = new URLSearchParams();
  if (query.kind) params.set("kind", query.kind);
  if (query.accountId) params.set("account", query.accountId);
  if (query.q) params.set("q", query.q);
  const qs = params.toString();

  const [result, accounts, categories] = await Promise.all([
    serverFetch<{ items: TransactionItem[]; pagination: { total: number } }>(
      `/api/transactions${qs ? `?${qs}` : ""}`,
    ),
    serverFetch<{ accounts: AccountRow[] }>("/api/accounts"),
    serverFetch<{ categories: CategoryRow[] }>("/api/categories"),
  ]);

  const accountOptions = accounts.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    shared: a.shared,
  }));
  const categoryOptions = categories.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Transactions</h1>
        <p className="text-sm text-muted">Every expense, income and transfer leg, in one place.</p>
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
