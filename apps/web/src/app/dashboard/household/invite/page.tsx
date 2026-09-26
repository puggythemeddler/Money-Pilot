import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { InviteAcceptForm } from "@/components/household/InviteAcceptForm";

export const metadata: Metadata = {
  title: "Join household",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function HouseholdInvitePage({ searchParams }: PageProps) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const sp = await searchParams;
  const token = sp.token?.trim() ?? "";

  return (
    <div className="space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Household invitation</h1>
        <p className="text-sm text-slate-500">Signed in as {auth.user.email}</p>
      </header>
      {token ? (
        <InviteAcceptForm token={token} />
      ) : (
        <p className="mx-auto max-w-md text-center text-sm text-slate-500">
          This invitation link is missing its token. Ask the household owner to send a complete
          link.
        </p>
      )}
    </div>
  );
}
