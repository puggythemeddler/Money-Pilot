import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CURRENCIES, currentReportMonth, formatMoney, reportMonths, type FinanceReport } from '@moneypilot/shared';
import { getServerUser, serverFetch } from '@/lib/server-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Reports', robots: { index: false, follow: false } };
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; currency?: string }> }) {
  const auth = await getServerUser();
  if (!auth) redirect('/login');
  const params = await searchParams;
  let month = typeof params.month === 'string' ? params.month : currentReportMonth(auth.user.timezone);
  let currency = typeof params.currency === 'string' ? params.currency : auth.user.preferredCurrency;
  let invalid = false;
  try { reportMonths(month); } catch { month = currentReportMonth(auth.user.timezone); invalid = true; }
  if (!Object.hasOwn(CURRENCIES, currency)) { currency = auth.user.preferredCurrency; invalid = true; }
  const report = await serverFetch<FinanceReport>(`/api/reports?${new URLSearchParams({ month, currency })}`);
  const peak = Math.max(1, ...report.trend.flatMap((row) => [row.incomeMinor, row.expenseMinor]));
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Reports</h1>
        <p className="text-sm text-muted">Understand your cash flow, spending and debt repayment.</p>
      </header>
      {invalid ? <Alert variant="warning">Invalid filters were reset. Choose a month and supported currency below.</Alert> : null}
      <Card><CardContent className="pt-6">
        <form action="/dashboard/reports" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Report month" htmlFor="report-month"><Input id="report-month" name="month" type="month" min="1900-01" max="2199-12" defaultValue={month} required /></Field>
          <Field label="Currency" htmlFor="report-currency"><Select id="report-currency" name="currency" defaultValue={currency}>{Object.values(CURRENCIES).map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</Select></Field>
          <Button type="submit">Update report</Button>
        </form>
        <p className="mt-3 text-xs text-muted">Personal accounts only. Transfers and opening balances are excluded. Currencies are reported separately, without conversion. Calendar months use the recorded transaction date.</p>
      </CardContent></Card>
      <section aria-label={`${monthLabel(month)} totals`} className="grid min-w-0 gap-3 md:grid-cols-3">
        {[
          { label: 'Income', value: report.totals.incomeMinor },
          { label: 'Expenses', value: report.totals.expenseMinor },
          { label: 'Net cash flow', value: report.totals.netMinor },
        ].map((item) => <Card key={item.label}><CardHeader><CardDescription>{item.label} · {monthLabel(month)}</CardDescription><CardTitle className="break-words text-xl tabular-nums">{formatMoney(item.value, currency)}</CardTitle></CardHeader></Card>)}
      </section>
      <Card>
        <CardHeader><CardTitle>Income versus expenses</CardTitle><CardDescription>Six calendar months ending {monthLabel(month)} · {currency}</CardDescription></CardHeader>
        <CardContent>
          <ul className="space-y-5">{report.trend.map((row) => <li key={row.month} className="space-y-2">
            <p className="text-sm font-semibold">{monthLabel(row.month)}</p>
            <div><p className="flex flex-wrap justify-between gap-x-3 text-xs text-body"><span>Income</span><span className="tabular-nums">{formatMoney(row.incomeMinor, currency)}</span></p><div aria-hidden="true" className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(0, row.incomeMinor / peak * 100)}%` }} /></div></div>
            <div><p className="flex flex-wrap justify-between gap-x-3 text-xs text-body"><span>Expenses</span><span className="tabular-nums">{formatMoney(row.expenseMinor, currency)}</span></p><div aria-hidden="true" className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary-700" style={{ width: `${Math.max(0, row.expenseMinor / peak * 100)}%` }} /></div></div>
          </li>)}</ul>
        </CardContent>
      </Card>
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Spending by category</CardTitle><CardDescription>{monthLabel(month)} · {currency}</CardDescription></CardHeader><CardContent>
          {report.categories.length ? <ul className="space-y-4">{report.categories.map((item) => {
            const percent = report.totals.expenseMinor > 0 ? item.amountMinor / report.totals.expenseMinor * 100 : 0;
            return <li key={item.id ?? 'uncategorized'}><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="break-words">{item.name}</span><span className="tabular-nums">{formatMoney(item.amountMinor, currency)} · {Math.round(percent)}%</span></div><div aria-hidden="true" className="mt-2 h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary-700" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div></li>;
          })}</ul> : <p className="text-sm text-muted">No expenses recorded in {currency} for this month.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Debt repayment progress</CardTitle><CardDescription>Current active debts in {currency} · all-time linked payments</CardDescription></CardHeader><CardContent>
          <p className="mb-4 text-xs text-muted">This is your current position, independent of the month filter. Balances use the entered amount plus any configured full-term interest estimate, minus recorded payments. Estimates exclude fees and early-settlement adjustments.</p>
          {report.debts.length ? <ul className="space-y-5">{report.debts.map((debt) => <li key={debt.id}>
            <p className="break-words text-sm font-semibold">{debt.name}</p>
            <p className="mt-1 text-sm tabular-nums">{formatMoney(debt.balanceMinor, currency)} {debt.projected ? 'estimated remaining' : 'remaining'}</p>
            <p className="mt-1 text-xs text-muted">Paid {formatMoney(debt.paidMinor, currency)} of {formatMoney((debt.totalRepayableMinor ?? debt.principalMinor), currency)}</p>
            <progress aria-label={`${debt.name} repayment progress`} max={Math.max(1, (debt.totalRepayableMinor ?? debt.principalMinor))} value={Math.max(0, Math.min((debt.totalRepayableMinor ?? debt.principalMinor), debt.paidMinor))} className="mt-2 h-2 w-full accent-primary-700" />
          </li>)}</ul> : <p className="text-sm text-muted">No active debts tracked in {currency}.</p>}
          <Link href="/dashboard/debts" className="mt-4 inline-block text-sm font-semibold text-primary-700 dark:text-primary-300">Manage debts →</Link>
        </CardContent></Card>
      </div>
    </div>
  );
}
