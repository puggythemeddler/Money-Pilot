import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMoney } from "@moneypilot/shared";
import { getAuthContext } from "@/lib/auth";
import { dashboardSummary } from "@/lib/finance/dashboard";
import { ResendVerification } from "@/components/ResendVerification";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/Logo";

export default async function DashboardPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const summary = await dashboardSummary(auth.user.id);
  const firstName = auth.user.name.split(" ")[0] ?? auth.user.name;
  const currency = auth.user.preferredCurrency;

  const monthNet = summary.month.netMinor;
  const monthNetClass = monthNet < 0 ? "text-red-600" : "text-emerald-600";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Karibu, {firstName}</h1>
        <p className="text-sm text-slate-500">Your balances, cash flow and spending at a glance.</p>
      </header>

      {!auth.user.emailVerified ? (
        <Alert variant="warning" title="Verify your email to secure your account">
          You will not be able to recover your password without a verified email. <ResendVerification />
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Money in accounts</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-slate-900">
              {formatMoney(summary.availableMinor, currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Spent this month</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums text-red-600">
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
            <CardTitle className="text-2xl font-bold tabular-nums text-slate-900">
              {formatMoney(summary.allTime.incomeMinor - summary.allTime.expenseMinor, currency)}
            </CardTitle>
            <CardDescription className="tabular-nums">
              in {formatMoney(summary.allTime.incomeMinor, currency)}, out {formatMoney(summary.allTime.expenseMinor, currency)}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {summary.accounts.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex items-start gap-3">
              <Icons.wallet className="mt-0.5 h-5 w-5 text-slate-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">Build your financial picture</p>
                <p className="text-sm leading-relaxed text-slate-600">
                  Add your first account, then record expenses, income and transfers. Every number on this
                  dashboard comes straight from your data — we never show invented figures.
                </p>
                <Link
                  href="/dashboard/accounts"
                  className="mt-1 inline-block text-sm font-medium text-primary-700 hover:underline"
                >
                  Add an account →
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>{summary.accounts.length} accounts tracked</CardDescription>
              </div>
              <Link href="/dashboard/accounts" className="text-sm font-medium text-primary-700 hover:underline">
                Manage →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {summary.accounts.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
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
              <Link href="/dashboard/transactions" className="text-sm font-medium text-primary-700 hover:underline">
                All transactions →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {summary.categorySpending.length === 0 ? (
                <p className="px-6 py-6 text-sm text-slate-500">No spending recorded this month yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {summary.categorySpending.map((c) => (
                    <li key={c.categoryId ?? "none"} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                        <p className="truncate text-sm font-medium text-slate-900">{c.categoryName}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-red-600">{formatMoney(c.amountMinor, currency)}</p>
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
              <Link href="/dashboard/transactions" className="text-sm font-medium text-primary-700 hover:underline">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {summary.recentTransactions.length === 0 ? (
                <p className="px-6 py-6 text-sm text-slate-500">No transactions yet — record the first one.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {summary.recentTransactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {t.description || (t.kind === "TRANSFER" ? "Transfer" : "Transaction")}
                          </p>
                          {t.categoryName ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500"
                              style={{ background: `${t.categoryColor}1a` }}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ background: t.categoryColor ?? "#94a3b8" }} aria-hidden="true" />
                              {t.categoryName}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
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
                          t.amountMinor < 0 ? "text-red-600" : "text-emerald-600"
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
      )}

      <p className="text-sm text-slate-500">
        Heads to <Link href="/dashboard/settings" className="font-medium text-slate-700 hover:underline">Settings</Link> to
        update your profile, currency or timezone.
      </p>
    </div>
  );
}