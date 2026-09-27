import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MoneyPilot",
    template: "%s · MoneyPilot",
  },
  description:
    "Take control of your money. Track income, expenses, debts, bills and budgets in one place — on web, Android and iPhone.",
  applicationName: "MoneyPilot",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Runs before first paint (blocking, first element in <body>) so the theme
 * class is on <html> before anything renders — no light/dark flash. The
 * stored choice wins; without one the system preference is followed.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("mp-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-page font-sans text-heading antialiased">
        {/* Static constant, rendered as raw JS (never user data) — no-flash theme init. */}
        <script>{themeInitScript}</script>
        {children}
      </body>
    </html>
  );
}
