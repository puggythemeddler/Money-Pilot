import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerUser } from "@/lib/server-api";
import { BottomNav, Sidebar } from "@/components/AppNav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#dashboard-main" className="fixed left-4 top-4 z-50 -translate-y-32 rounded-md bg-surface px-4 py-3 text-heading focus:translate-y-0">Skip to main content</a>
      <Sidebar user={auth.user} />
      <div className="min-w-0">
        <main id="dashboard-main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
