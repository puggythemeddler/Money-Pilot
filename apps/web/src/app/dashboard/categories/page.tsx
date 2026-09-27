import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser, serverFetch } from "@/lib/server-api";
import { CategoriesManager, type CategoryRow } from "@/components/finance/CategoriesManager";

export const metadata: Metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};

export default async function CategoriesPage() {
  const auth = await getServerUser();
  if (!auth) redirect("/login");

  const { categories } = await serverFetch<{ categories: CategoryRow[] }>("/api/categories?archived=true");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-heading">Categories</h1>
        <p className="text-sm text-muted">
          Organise income and expenses so reports say something useful.
        </p>
      </header>
      <CategoriesManager categories={categories} />
    </div>
  );
}
