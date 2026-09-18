import Link from "next/link";
import { MoneyPilotLogo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" aria-label="MoneyPilot home" className="mb-6">
        <MoneyPilotLogo />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}