import { prisma } from "@/lib/db";

export interface AccountBalance {
  accountId: string;
  /** Signed balance in minor units: opening balance + all open transactions. */
  balanceMinor: number;
}

/**
 * Derives the current signed balance for each requested account from the
 * transaction log (the single source of truth) — balances are never stored.
 */
export async function accountBalances(
  userId: string,
  accountIds: string[],
): Promise<Record<string, AccountBalance>> {
  if (accountIds.length === 0) return {};

  const rows = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId, accountId: { in: accountIds }, deletedAt: null },
    _sum: { amountMinor: true },
  });

  const balances = new Map<string, number>();
  for (const id of accountIds) balances.set(id, 0);
  for (const r of rows) {
    if (r._sum.amountMinor !== null) {
      balances.set(r.accountId, (balances.get(r.accountId) ?? 0) + r._sum.amountMinor);
    }
  }
  const out: Record<string, AccountBalance> = {};
  for (const id of accountIds) out[id] = { accountId: id, balanceMinor: balances.get(id) ?? 0 };
  return out;
}

export interface KindTotals {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/** Sums open income/expense/adjustment transactions (excludes transfers). */
export async function totalsByRange(
  userId: string,
  from?: Date,
  to?: Date,
): Promise<KindTotals> {
  const rows = await prisma.transaction.groupBy({
    by: ["kind"],
    where: {
      userId,
      deletedAt: null,
      ...(from ? { transactionDate: { gte: from } } : {}),
      ...(to ? { transactionDate: { lt: to } } : {}),
    },
    _sum: { amountMinor: true },
  });
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    const v = r._sum.amountMinor ?? 0;
    if (r.kind === "INCOME") income += v;
    else if (r.kind === "EXPENSE") expense += v;
  }
  // Expenses are stored signed-negative; report magnitudes.
  return { incomeMinor: income, expenseMinor: -expense, netMinor: income + expense };
}