import Link from "next/link";
import { MoneyPilotLogo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Link href="/" aria-label="MoneyPilot home" className="mb-6">
        <MoneyPilotLogo />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}