import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getHouseholdOverview, getHouseholdView } from "@/lib/finance/households";
import { HouseholdManager } from "@/components/household/HouseholdManager";

export const metadata: Metadata = {
  title: "Household",
  robots: { index: false, follow: false },
};

export default async function HouseholdPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const [household, overview] = await Promise.all([
    getHouseholdView(auth.user.id),
    getHouseholdOverview(auth.user.id),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Household</h1>
        <p className="text-sm text-slate-500">
          Shared accounts for a couple or family — joint balances, who recorded what, and each
          member&apos;s spending. Personal ledgers stay private.
        </p>
      </header>
      <HouseholdManager
        household={household}
        overview={overview}
        displayCurrency={auth.user.preferredCurrency}
      />
    </div>
  );
}
