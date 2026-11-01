export interface FinanceReport {
  month: string;
  currency: string;
  totals: { incomeMinor: number; expenseMinor: number; netMinor: number };
  trend: { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }[];
  categories: { id: string | null; name: string; color: string; amountMinor: number }[];
  debts: { id: string; name: string; principalMinor: number; paidMinor: number; balanceMinor: number; totalRepayableMinor?: number; projected?: boolean }[];
}

export function currentReportMonth(timezone: string, now = new Date()): string {
  return currentReportDate(timezone, now).slice(0, 7);
}

export function currentReportDate(timezone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}-${parts.find((p) => p.type === 'day')!.value}`;
  } catch { return now.toISOString().slice(0, 10); }
}

export function reportMonths(month: string): string[] {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month between 1900 and 2199.');
  const [year, number] = month.split('-').map(Number);
  return Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year!, number! - 6 + index, 1)).toISOString().slice(0, 7));
}
