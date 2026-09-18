import { prisma } from "@/lib/db";
import { listAccounts } from "./accounts";
import { totalsByRange } from "./balances";
import { isoDate, toUtcMidnight } from "./dates";

export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  color: string;
  amountMinor: number;
}

/** Aggregates that power the dashboard. All values are signed minor units. */
export async function dashboardSummary(userId: string) {
  const accounts = await listAccounts(userId);
  const availableMinor = accounts.reduce((sum, a) => sum + a.balanceMinor, 0);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [month, allTime, spending, recent] = await Promise.all([
    totalsByRange(userId, monthStart, nextMonth),
    totalsByRange(userId, undefined, undefined),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        kind: "EXPENSE",
        deletedAt: null,
        transactionDate: { gte: monthStart, lt: nextMonth },
      },
      _sum: { amountMinor: true },
    }),
    prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
  ]);

  const categoryAgg = await prisma.category.findMany({
    where: { userId, id: { in: spending.map((s) => s.categoryId ?? "").filter(Boolean) } },
    select: { id: true, name: true, color: true },
  });
  const catInfo = new Map(categoryAgg.map((c) => [c.id, c]));

  const categorySpending: CategorySpending[] = spending
    .map((s) => {
      const info = s.categoryId ? catInfo.get(s.categoryId) : undefined;
      return {
        categoryId: s.categoryId,
        categoryName: info?.name ?? "Uncategorized",
        color: info?.color ?? "#94a3b8",
        amountMinor: -(s._sum.amountMinor ?? 0),
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, 6);

  return {
    availableMinor,
    month: {
      from: isoDate(monthStart),
      to: isoDate(toUtcMidnight(new Date())),
      incomeMinor: month.incomeMinor,
      expenseMinor: month.expenseMinor,
      netMinor: month.netMinor,
    },
    allTime: {
      incomeMinor: allTime.incomeMinor,
      expenseMinor: allTime.expenseMinor,
    },
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balanceMinor: a.balanceMinor,
      archived: a.archived,
    })),
    categorySpending,
    recentTransactions: recent.map((t) => ({
      id: t.id,
      kind: t.kind,
      amountMinor: t.amountMinor,
      currency: t.currency,
      description: t.description,
      merchant: t.merchant,
      transactionDate: t.transactionDate.toISOString(),
      accountName: t.account.name,
      categoryName: t.category?.name ?? null,
      categoryColor: t.category?.color ?? null,
    })),
  };
}