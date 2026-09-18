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
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}