import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { listCategories } from "@/lib/finance/categories";
import { CategoriesManager } from "@/components/finance/CategoriesManager";

export const metadata: Metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};

export default async function CategoriesPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const categories = await listCategories(auth.user.id, { includeArchived: true });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Categories</h1>
        <p className="text-sm text-slate-500">
          Organise income and expenses so reports say something useful.
        </p>
      </header>
      <CategoriesManager categories={categories} />
    </div>
  );
}