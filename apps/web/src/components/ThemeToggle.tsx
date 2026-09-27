"use client";

import { cn } from "@/lib/cn";

const STORAGE_KEY = "mp-theme";

/**
 * Light/dark theme switch. The applied theme is a `.dark` class on
 * <html> (see globals.css and the no-flash script in the root layout);
 * this button only flips the class, persists the choice, and shows the
 * icon for the theme you would switch *to* — all state lives in the DOM,
 * so there is nothing to hydrate.
 */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      onClick={() => {
        const root = document.documentElement;
        const dark = root.classList.toggle("dark");
        try {
          localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
        } catch {
          /* private mode: the class still applies for this session */
        }
      }}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-body shadow-sm transition-colors hover:bg-surface-2 hover:text-heading",
        className,
      )}
    >
      {/* Moon = currently light (switch to dark); Sun = currently dark. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 dark:hidden" aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="hidden h-5 w-5 dark:block" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
      </svg>
    </button>
  );
}
