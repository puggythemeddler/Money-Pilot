import { AppError, CURRENCIES, ErrorCodes, minorToNumber, reportMonths, type FinanceReport } from '@moneypilot/shared';
import { prisma } from '@/lib/db';

export async function financeReport(userId: string, month: string, currency: string): Promise<FinanceReport> {
  let months: string[];
  try { months = reportMonths(month); } catch { throw new AppError(ErrorCodes.VALIDATION, 'Choose a valid month between 1900 and 2199.', 400); }
  if (!Object.hasOwn(CURRENCIES, currency)) throw new AppError(ErrorCodes.VALIDATION, 'Choose a supported currency.', 400);
  const from = new Date(`${months[0]}-01T00:00:00Z`);
  const selected = new Date(`${month}-01T00:00:00Z`);
  const until = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 1));
  const scope = { userId, currency, deletedAt: null, account: { householdId: null } };
  const [flow, spending, debts, payments] = await Promise.all([
    prisma.transaction.groupBy({ by: ['transactionDate', 'kind'], where: { ...scope, kind: { in: ['INCOME', 'EXPENSE'] }, transactionDate: { gte: from, lt: until } }, _sum: { amountMinor: true } }),
    prisma.transaction.groupBy({ by: ['categoryId'], where: { ...scope, kind: 'EXPENSE', transactionDate: { gte: selected, lt: until } }, _sum: { amountMinor: true } }),
    prisma.debt.findMany({ where: { userId, currency, archivedAt: null }, select: { id: true, name: true, principalMinor: true }, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.groupBy({ by: ['debtId'], where: { ...scope, kind: 'EXPENSE', debtId: { not: null } }, _sum: { amountMinor: true } }),
  ]);
  const trend = months.map((key) => ({ month: key, incomeMinor: 0, expenseMinor: 0, netMinor: 0 }));
  for (const row of flow) {
    const bucket = trend.find((item) => item.month === row.transactionDate.toISOString().slice(0, 7));
    if (!bucket) continue;
    const amount = minorToNumber(row._sum.amountMinor ?? 0);
    if (row.kind === 'INCOME') bucket.incomeMinor += amount;
    if (row.kind === 'EXPENSE') bucket.expenseMinor -= amount;
    bucket.netMinor = bucket.incomeMinor - bucket.expenseMinor;
  }
  const categoryInfo = await prisma.category.findMany({ where: { userId, id: { in: spending.flatMap((item) => item.categoryId ? [item.categoryId] : []) } }, select: { id: true, name: true, color: true } });
  const categories = spending.map((item) => {
    const category = categoryInfo.find((c) => c.id === item.categoryId);
    return { id: item.categoryId, name: category?.name ?? 'Uncategorized', color: category?.color ?? '#94a3b8', amountMinor: -minorToNumber(item._sum.amountMinor ?? 0) };
  }).sort((a, b) => b.amountMinor - a.amountMinor);
  return {
    month, currency, trend, totals: { incomeMinor: trend[5]!.incomeMinor, expenseMinor: trend[5]!.expenseMinor, netMinor: trend[5]!.netMinor }, categories,
    debts: debts.map((debt) => {
      const principalMinor = minorToNumber(debt.principalMinor);
      const paidMinor = -minorToNumber(payments.find((payment) => payment.debtId === debt.id)?._sum.amountMinor ?? 0);
      return { id: debt.id, name: debt.name, principalMinor, paidMinor, balanceMinor: Math.max(0, principalMinor - paidMinor) };
    }),
  };
}
