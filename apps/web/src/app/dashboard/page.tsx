import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMoney } from "@moneypilot/shared";
import { getServerCapabilities, getServerUser, serverFetch } from "@/lib/server-api";
import { ResendVerification } from "@/components/ResendVerification";
import { GetStarted } from "@/components/onboarding/GetStarted";
import { QuickAddTransaction } from "@/components/finance/QuickAddTransaction";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/Logo";

interface DashboardSummary {
  availableMinor: number;
  month: { incomeMinor: number; expenseMinor: number; netMinor: number };
  allTime: { incomeMinor: number; expenseMinor: number };
  household: { name: string } | null;
  accounts: { id: string; name: string; currency: string; balanceMinor: number }[];
  debt: {
    count: number;
    currency: string;
    totalMinor: number;
    others: { currency: string; totalMinor: number }[];
    items: { id: string; name: string; institution: string | null; currency: string; balanceMinor: number }[];
  };
  income: {
    currency: string;
    expectedMinor: number;
    receivedMinor: number;
    activeCount: number;
    receivedCount: number;
    others: { currency: string; expectedMinor: number; receivedMinor: number }[];
  };
  categorySpending: {
    categoryId: string | null;
    categoryName: string;
    color: string;
    amountMinor: number;
  }[];
  recentTransactions: {
    id: string;
    description: string | null;
    merchant: string | null;
    kind: string;
    categoryName: string | null;
    categoryColor: string | null;
    accountName: string;
    transactionDate: string;
    amountMinor: number;
    currency: string;
  }[];
}

export default async function DashboardPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const summary = await serverFetch<DashboardSummary>("/api/dashboard");
  const capabilities = await getServerCapabilities();
  const firstName = auth.user.name.split(" ")[0] ?? auth.user.name;
  const currency = auth.user.preferredCurrency;
  const hasTransactions = summary.allTime.incomeMinor !== 0 || summary.allTime.expenseMinor !== 0;

  const monthNet = summary.month.netMinor;
  const monthNetClass = monthNet < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Karibu, {firstName}</h1>
        <p className="text-sm text-muted">Your balances, cash flow and spending at a glance.</p>
      </header>

      {!auth.user.emailVerified ? (
        capabilities.emailDelivery ? (
          <Alert variant="warning" title="Verify your email to secure your account">
            You will not be able to recover your password without a verified email. <ResendVerification />
          </Alert>
        ) : (
          <Alert variant="warning" title="Email verification is unavailable on this server">
            This deployment cannot send email yet, so verification and password-reset links are not
            delivered. Your account still works — ask whoever runs this server to configure email
            delivery.
          </Alert>
        )
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Money in accounts</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-heading">
              {formatMoney(summary.availableMinor, currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Spent this month</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {formatMoney(-summary.month.expenseMinor, currency)}
            </CardTitle>
            <CardDescription className="tabular-nums">
              earned {formatMoney(summary.month.incomeMinor, currency)}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Net this month</CardDescription>
            <CardTitle className={`text-2xl font-bold tabular-nums ${monthNetClass}`}>
              {formatMoney(monthNet, currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>All-time totals</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-heading">
              {formatMoney(summary.allTime.incomeMinor - summary.allTime.expenseMinor, currency)}
            </CardTitle>
            <CardDescription className="tabular-nums">
              in {formatMoney(summary.allTime.incomeMinor, currency)}, out {formatMoney(summary.allTime.expenseMinor, currency)}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted">Total debt</p>
              <p className="text-2xl font-bold tabular-nums text-heading">
                {formatMoney(summary.debt.totalMinor, summary.debt.currency)}
              </p>
              <p className="text-xs text-faint">
                {summary.debt.count === 0 ? (
                  "Nothing owed — no active debts tracked."
                ) : (
                  <>
                    {summary.debt.count} {summary.debt.count === 1 ? "debt" : "debts"} outstanding
                    {summary.debt.others.length > 0
                      ? ` · plus ${summary.debt.others.map((o) => formatMoney(o.totalMinor, o.currency)).join(", ")}`
                      : ""}
                  </>
                )}
              </p>
            </div>
            <Link
              href="/dashboard/debts"
              className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
            >
              {summary.debt.count === 0 ? "Track a debt →" : "Manage →"}
            </Link>
          </div>
          {summary.debt.items.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
              {summary.debt.items.slice(0, 6).map((d) => (
                <li key={d.id} className="text-xs text-faint">
                  {d.name}
                  {d.institution ? ` · ${d.institution}` : ""}{" "}
                  <span className="font-semibold tabular-nums text-body">
                    {formatMoney(d.balanceMinor, d.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted">Income this period</p>
              <p className="text-2xl font-bold tabular-nums text-heading">
                {formatMoney(summary.income.receivedMinor, summary.income.currency)}
              </p>
              <p className="text-xs text-faint">
                {summary.income.activeCount === 0 ? (
                  "No recurring income tracked yet."
                ) : (
                  <>
                    received of {formatMoney(summary.income.expectedMinor, summary.income.currency)} expected ·{" "}
                    {summary.income.receivedCount} of {summary.income.activeCount} recorded
                    {summary.income.others.length > 0
                      ? ` · plus ${summary.income.others
                          .map((o) => formatMoney(o.receivedMinor, o.currency))
                          .join(", ")}`
                      : ""}
                  </>
                )}
              </p>
            </div>
            <Link
              href="/dashboard/income"
              className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
            >
              {summary.income.activeCount === 0 ? "Add income →" : "Manage →"}
            </Link>
          </div>
        </CardContent>
      </Card>

      {summary.household ? (
        <Card>
          <CardContent>
            <div className="flex items-start gap-3">
              <Icons.users className="mt-0.5 h-5 w-5 text-primary-600" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-heading">
                  {summary.household.name} · shared finances
                </p>
                <p className="text-sm leading-relaxed text-body">
                  Joint balances, each member&apos;s spending and shared recent activity live on the
                  household page — your personal ledger stays private.
                </p>
                <Link
                  href="/dashboard/household"
                  className="mt-1 inline-block text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
                >
                  Open household →
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <GetStarted
        accounts={summary.accounts}
        currency={currency}
        hasTransactions={hasTransactions}
      />

      {summary.accounts.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>{summary.accounts.length} accounts tracked</CardDescription>
              </div>
              <Link href="/dashboard/accounts" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">
                Manage →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {summary.accounts.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <p className="truncate text-sm font-medium text-heading">{a.name}</p>
                    <p className="text-sm font-semibold tabular-nums text-heading">
                      {formatMoney(a.balanceMinor, a.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Top spending</CardTitle>
                <CardDescription>This month by category</CardDescription>
              </div>
              <Link href="/dashboard/transactions" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">
                All transactions →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {summary.categorySpending.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted">No spending recorded this month yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {summary.categorySpending.map((c) => (
                    <li key={c.categoryId ?? "none"} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                        <p className="truncate text-sm font-medium text-heading">{c.categoryName}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(c.amountMinor, currency)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest records across all accounts</CardDescription>
              </div>
              <Link href="/dashboard/transactions" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {summary.recentTransactions.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted">No transactions yet — record the first one.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {summary.recentTransactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="truncate text-sm font-medium text-heading">
                            {t.description || (t.kind === "TRANSFER" ? "Transfer" : "Transaction")}
                          </p>
                          {t.categoryName ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted"
                              style={{ background: `${t.categoryColor}1a` }}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ background: t.categoryColor ?? "#94a3b8" }} aria-hidden="true" />
                              {t.categoryName}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-faint">
                          {t.merchant ? `${t.merchant} · ` : ""}
                          {t.accountName} ·{" "}
                          {new Date(t.transactionDate).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          t.amountMinor < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {t.amountMinor < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(t.amountMinor), t.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {summary.accounts.length > 0 && hasTransactions ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick add</CardTitle>
            <CardDescription>Record an expense or income in seconds.</CardDescription>
          </CardHeader>
          <CardContent>
            <QuickAddTransaction accounts={summary.accounts} currency={currency} />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted">
        Heads to <Link href="/dashboard/settings" className="font-medium text-body hover:underline">Settings</Link> to
        update your profile, currency or timezone.
      </p>
    </div>
  );
}
