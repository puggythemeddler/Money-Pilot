"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoneyPilotLogo, Icons } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AuthUser } from "@moneypilot/shared";

const realNav = [
  { href: "/dashboard", label: "Overview", icon: Icons.dashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Icons.wallet },
  { href: "/dashboard/transactions", label: "Transactions", icon: Icons.receipt },
  { href: "/dashboard/transfers", label: "Transfers", icon: Icons.swap },
  { href: "/dashboard/household", label: "Household", icon: Icons.users },
  { href: "/dashboard/budgets", label: "Budgets", icon: Icons.target },
  { href: "/dashboard/debts", label: "Debts", icon: Icons.scale },
  { href: "/dashboard/bills", label: "Bills", icon: Icons.calendar },
  { href: "/dashboard/categories", label: "Categories", icon: Icons.tag },
  { href: "/dashboard/settings", label: "Settings", icon: Icons.settings },
];

const mobileNav = ["/dashboard", "/dashboard/accounts", "/dashboard/transactions", "/dashboard/transfers", "/dashboard/budgets"];

const comingSoon = ["Calendar", "Reports", "Imports"];

function MobileNotice({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-faint">
      {children}
    </span>
  );
}

export function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/dashboard">
          <MoneyPilotLogo />
        </Link>
        <ThemeToggle />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Dashboard navigation">
        <div className="space-y-1">
          {realNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300"
                    : "text-body hover:bg-surface-2 hover:text-heading"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div>
          <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
            Coming later
          </p>
          <div className="space-y-1">
            {comingSoon.map((label) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-faint"
                aria-disabled="true"
              >
                <span className="inline-block h-5 w-5 rounded-md bg-surface-2" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <MobileNotice>soon</MobileNotice>
              </div>
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-line px-3 py-3">
        <div className="mb-2 px-3">
          <p className="truncate text-sm font-medium text-heading">{user.name}</p>
          <p className="truncate text-xs text-faint">{user.email}</p>
        </div>
        <LogoutButton className="w-full justify-start px-3" />
      </div>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = realNav.filter((item) => mobileNav.includes(item.href));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-line bg-surface/95 px-2 py-2 backdrop-blur lg:hidden"
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium ${
              active
                ? "text-primary-700 dark:text-primary-300"
                : "text-body hover:text-heading"
            }`}
          >
            <item.icon className="h-6 w-6" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}