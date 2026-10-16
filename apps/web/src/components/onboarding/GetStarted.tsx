"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { QuickAddTransaction, type QuickAddAccount } from "@/components/finance/QuickAddTransaction";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Guided first run: get a brand-new account from "empty dashboard" to a real
 * balance and first transaction in two steps. Deliberately short — nothing
 * here is required, and every field can be edited or skipped later.
 */

const ACCOUNT_PRESETS = [
  { type: "MPESA", label: "M-Pesa", name: "M-Pesa" },
  { type: "BANK", label: "Bank", name: "Bank account" },
  { type: "CASH", label: "Cash", name: "Cash" },
  { type: "SAVINGS", label: "Savings", name: "Savings" },
] as const;

function StepBadge({ done, index }: { done: boolean; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        done
          ? "bg-emerald-600 text-white"
          : "bg-surface-2 text-muted ring-1 ring-inset ring-line"
      }`}
    >
      {done ? "✓" : index}
    </span>
  );
}

export function GetStarted({
  accounts,
  currency,
  hasTransactions,
}: {
  accounts: QuickAddAccount[];
  currency: string;
  hasTransactions: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("BANK");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Onboarding is done once there is an account and at least one transaction.
  if (accounts.length > 0 && hasTransactions) return null;

  const hasAccount = accounts.length > 0;

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          currency,
          ...(opening.trim() ? { openingBalance: opening.trim() } : {}),
        }),
      });
      setName("");
      setOpening("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get started</CardTitle>
        <CardDescription>
          Two quick steps to a dashboard with real numbers. Nothing here is permanent — you can
          rename, archive or add more later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <StepBadge done={hasAccount} index={1} />
            <div>
              <p className="text-sm font-medium text-heading">Add an account</p>
              <p className="text-sm text-muted">
                {hasAccount
                  ? `Tracking ${accounts.length} account${accounts.length === 1 ? "" : "s"}. Add more or manage them on the Accounts page.`
                  : "Where does your money live? Add the one you use most."}
              </p>
            </div>
          </div>

          {!hasAccount ? (
            <div className="space-y-4 pl-9">
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset.type}
                    type="button"
                    onClick={() => {
                      setType(preset.type);
                      setName(preset.name);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      type === preset.type
                        ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300"
                        : "border-line bg-surface text-body hover:bg-surface-2"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <form onSubmit={createAccount} className="grid gap-4 sm:grid-cols-2">
                <Field label="Account name" htmlFor="getstarted-name">
                  <Input
                    id="getstarted-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. M-Pesa, KCB account"
                    required
                  />
                </Field>
                <Field label={`Opening balance (${currency})`} htmlFor="getstarted-opening" hint="Optional">
                  <Input
                    id="getstarted-opening"
                    value={opening}
                    onChange={(e) => setOpening(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={busy}>
                    Add account
                  </Button>
                </div>
              </form>
              {error ? <Alert variant="error">{error}</Alert> : null}
            </div>
          ) : (
            <div className="pl-9">
              <Link
                href="/dashboard/accounts"
                className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
              >
                Manage accounts →
              </Link>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <StepBadge done={hasTransactions} index={2} />
            <div>
              <p className="text-sm font-medium text-heading">Record your first transaction</p>
              <p className="text-sm text-muted">
                {hasAccount
                  ? "Log spending or income — balances update instantly."
                  : "Add an account to unlock this step."}
              </p>
            </div>
          </div>
          {hasAccount ? (
            <div className="pl-9">
              <QuickAddTransaction accounts={accounts} currency={currency} />
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
