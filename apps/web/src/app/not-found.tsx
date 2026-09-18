import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-primary-600">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you are looking for does not exist or has moved.
      </p>
      <Link href="/" className="mt-6 inline-flex">
        <Button variant="outline">Back to home</Button>
      </Link>
    </div>
  );
}