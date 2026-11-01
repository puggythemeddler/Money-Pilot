import { describe, expect, it } from 'vitest';
import { calculateDebtInterest, type DebtInterestTerms } from '../src/debt-interest';
import { debtCreateSchema, debtUpdateSchema } from '../src/schemas/finance';
const terms: DebtInterestTerms = { interestMethod: 'FLAT', interestPeriod: 'ANNUAL', interestRate: '12', startDate: '2025-01-31', termMonths: 12 };
describe('fixed-rate full-term debt estimates', () => {
  it('keeps legacy and already-inclusive amounts unchanged, even with a reference rate', () => {
    for (const method of ['NONE', 'INCLUDED']) expect(calculateDebtInterest(10000000, { ...terms, interestMethod: method, startDate: null, termMonths: null })).toMatchObject({ interestMinor: 0, totalRepayableMinor: 10000000, projected: false });
    expect(debtCreateSchema.parse({ name: 'Legacy', principal: '1000', interestRate: '12' }).interestMethod).toBe('NONE');
    expect(debtUpdateSchema.safeParse({ interestRate: null, termMonths: null, startDate: null, interestMethod: 'NONE' }).success).toBe(true);
  });
  it('distinguishes annual and monthly flat interest, including a partial year', () => {
    expect(calculateDebtInterest(10000000, terms)).toMatchObject({ interestMinor: 1200000, totalRepayableMinor: 11200000, monthlyPaymentMinor: 933334 });
    expect(calculateDebtInterest(10000000, { ...terms, termMonths: 6 }).interestMinor).toBe(600000);
    expect(calculateDebtInterest(10000000, { ...terms, interestPeriod: 'MONTHLY', interestRate: '1' }).interestMinor).toBe(1200000);
  });
  it('amortises reducing-balance interest with rounded monthly charges and final adjustment', () => {
    const result = calculateDebtInterest(10000000, { ...terms, interestMethod: 'REDUCING' });
    expect(result.monthlyPaymentMinor).toBe(888488);
    expect(result.interestMinor).toBeGreaterThan(660000);
    expect(result.interestMinor).toBeLessThan(662000);
    expect(result.totalRepayableMinor).toBe(10000000 + result.interestMinor);
    expect(calculateDebtInterest(10000000, { ...terms, interestMethod: 'REDUCING', interestRate: '0' }).interestMinor).toBe(0);
    expect(calculateDebtInterest(10000000, { ...terms, interestMethod: 'REDUCING', termMonths: 1 }).interestMinor).toBe(100000);
  });
  it('rejects missing terms, invalid dates and amounts that cannot be represented safely', () => {
    for (const patch of [{ termMonths: null }, { termMonths: 0 }, { termMonths: 601 }, { startDate: '2025-02-30' }, { interestRate: '-1' }, { interestRate: '1001' }, { interestMethod: 'UNKNOWN' }, { interestPeriod: 'DAILY' }]) expect(() => calculateDebtInterest(10000, { ...terms, ...patch })).toThrow();
    expect(() => calculateDebtInterest(Number.MAX_SAFE_INTEGER, terms)).toThrow(/range/);
  });
});
