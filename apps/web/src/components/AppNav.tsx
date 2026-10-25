"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { MoneyPilotLogo, Icons } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AuthUser } from "@moneypilot/shared";

const realNav = [
  { href: "/dashboard", label: "Overview", icon: Icons.dashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Icons.wallet },
  { href: "/dashboard/transactions", label: "Transactions", icon: Icons.receipt },
  { href: "/dashboard/income", label: "Income", icon: Icons.income },
  { href: "/dashboard/transfers", label: "Transfers", icon: Icons.swap },
  { href: "/dashboard/household", label: "Household", icon: Icons.users },
  { href: "/dashboard/budgets", label: "Budgets", icon: Icons.target },
  { href: "/dashboard/debts", label: "Debts", icon: Icons.scale },
  { href: "/dashboard/bills", label: "Bills", icon: Icons.calendar },
  { href: "/dashboard/categories", label: "Categories", icon: Icons.tag },
  { href: "/dashboard/settings", label: "Settings", icon: Icons.settings },
];

const mobileNav = ["/dashboard", "/dashboard/accounts", "/dashboard/transactions", "/dashboard/debts"];

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
  const more = useRef<HTMLDialogElement>(null);
  const items = realNav.filter((item) => mobileNav.includes(item.href));
  return (
    <>
    <dialog ref={more} aria-labelledby="mobile-menu-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-heading shadow-xl backdrop:bg-black/50">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="mobile-menu-title" className="text-lg font-semibold">All pages</h2>
        <button type="button" onClick={() => more.current?.close()} className="rounded-lg px-3 py-2 text-sm">Close</button>
      </div>
      <nav aria-label="All mobile pages" className="grid grid-cols-2 gap-2">
        {realNav.map((item) => <Link key={item.href} href={item.href} onClick={() => more.current?.close()} aria-current={pathname === item.href ? "page" : undefined} className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><item.icon className="h-5 w-5 shrink-0" />{item.label}</Link>)}
      </nav>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4"><ThemeToggle /><LogoutButton /></div>
    </dialog>
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium ${
              active
                ? "text-primary-700 dark:text-primary-300"
                : "text-body hover:text-heading"
            }`}
          >
            <item.icon className="h-6 w-6" />
            {item.label === "Transactions" ? "Activity" : item.label}
          </Link>
        );
      })}
      <button type="button" aria-haspopup="dialog" onClick={() => more.current?.showModal()} className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium text-body"><Icons.settings className="h-6 w-6" />More</button>
    </nav>
    </>
  );
}
