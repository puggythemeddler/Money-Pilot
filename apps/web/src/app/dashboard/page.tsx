import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ResendVerification } from "@/components/ResendVerification";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const firstName = auth.user.name.split(" ")[0] ?? auth.user.name;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Karibu, {firstName} 👋
        </h1>
        <p className="text-sm text-slate-500">
          Your MoneyPilot account is ready. Here&apos;s where your financial picture will appear.
        </p>
      </header>

      {!auth.user.emailVerified ? (
        <Alert variant="warning" title="Verify your email to secure your account">
          You will not be able to recover your password without a verified email.{" "}
          <ResendVerification />
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your overview is almost here</CardTitle>
          <CardDescription>
            Reports, balances and charts are built from real account data — we do not show invented
            numbers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-slate-600">
            MoneyPilot is being built in phases. Accounts, transactions, debts, bills and budgets
            land in Phase 2 – 4, and once you add your first records, this page becomes a live
            dashboard: money in, money out, remaining budget, total debt, next payment due and net
            cash flow — all from your actual data.
          </p>
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Head to <span className="font-medium text-slate-800">Settings</span> to update your
            profile, currency and timezone, or to manage the devices signed in to this account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}