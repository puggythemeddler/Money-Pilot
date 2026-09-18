import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth";
import { BottomNav, Sidebar } from "@/components/AppNav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Sidebar user={auth.user} />
      <div className="min-w-0">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}