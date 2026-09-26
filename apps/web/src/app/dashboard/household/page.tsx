import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import {
  HouseholdManager,
  type HouseholdOverview,
  type HouseholdView,
} from "@/components/household/HouseholdManager";

export const metadata: Metadata = {
  title: "Household",
  robots: { index: false, follow: false },
};

export default async function HouseholdPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const [household, overview] = await Promise.all([
    serverFetch<{ household: HouseholdView | null }>("/api/household"),
    serverFetch<{ overview: HouseholdOverview }>("/api/household/overview"),
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
        household={household.household}
        overview={overview.overview}
        displayCurrency={auth.user.preferredCurrency}
      />
    </div>
  );
}
