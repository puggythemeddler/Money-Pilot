import Link from "next/link";
import { MoneyPilotLogo, Icons } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import type { AuthUser } from "@/lib/auth";

const realNav = [
  { href: "/dashboard", label: "Overview", icon: Icons.dashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Icons.wallet },
  { href: "/dashboard/transactions", label: "Transactions", icon: Icons.receipt },
  { href: "/dashboard/transfers", label: "Transfers", icon: Icons.swap },
  { href: "/dashboard/categories", label: "Categories", icon: Icons.tag },
  { href: "/dashboard/settings", label: "Settings", icon: Icons.settings },
];

const comingSoon = ["Debts", "Bills", "Budgets", "Calendar", "Reports", "Imports"];

function MobileNotice({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
      {children}
    </span>
  );
}

export function Sidebar({ user }: { user: AuthUser }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="px-5 py-5">
        <Link href="/dashboard">
          <MoneyPilotLogo />
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Dashboard navigation">
        <div className="space-y-1">
          {realNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </div>

        <div>
          <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Coming later
          </p>
          <div className="space-y-1">
            {comingSoon.map((label) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
                aria-disabled="true"
              >
                <span className="inline-block h-5 w-5 rounded-md bg-slate-100" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <MobileNotice>soon</MobileNotice>
              </div>
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <div className="mb-2 px-3">
          <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
        </div>
        <LogoutButton className="w-full justify-start px-3" />
      </div>
    </aside>
  );
}

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden"
      aria-label="Mobile navigation"
    >
      {realNav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600"
        >
          <item.icon className="h-6 w-6" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}