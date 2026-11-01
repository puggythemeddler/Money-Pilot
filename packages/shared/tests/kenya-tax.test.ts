import { describe, expect, it } from 'vitest';
import { calculateKenyaEmploymentTax, suggestTaxFigures, type KenyaTaxEntry } from '../src/kenya-tax';

const entry = (chargeable: number, patch: Partial<KenyaTaxEntry> = {}): KenyaTaxEntry => ({ employer: 'Example employer', kind: 'P9', chargeableMinor: chargeable * 100, payeMinor: 0, insuranceReliefMinor: 0, ...patch });
describe('Kenya 2025 annual resident employment worksheet', () => {
  it('uses annual band boundaries and the 32.5% / 35% upper bands', () => {
    for (const [income, tax] of [[288000, 28800], [388000, 53800], [1000000, 237400], [6000000, 1737400], [9600000, 2907400], [10000000, 3047400]]) {
      expect(calculateKenyaEmploymentTax(2025, [entry(income!)]).taxBeforeReliefMinor).toBe(tax! * 100);
    }
  });
  it('applies personal relief once, floors tax at zero and credits actual PAYE', () => {
    const result = calculateKenyaEmploymentTax(2025, [entry(500000, { employer: 'A', payeMinor: 10000000 }), entry(500000, { employer: 'B', payeMinor: 10000000 })]);
    expect(result.taxAfterReliefMinor).toBe(20860000);
    expect(result.balanceMinor).toBe(860000);
    expect(calculateKenyaEmploymentTax(2025, [entry(100000)]).taxAfterReliefMinor).toBe(0);
    expect(calculateKenyaEmploymentTax(2025, [entry(0, { payeMinor: 20000 })]).balanceMinor).toBe(-20000);
  });
  it('caps insurance relief annually and across employers in each payslip month', () => {
    expect(calculateKenyaEmploymentTax(2025, [entry(1000000, { insuranceReliefMinor: 9000000 })]).insuranceReliefMinor).toBe(6000000);
    const result = calculateKenyaEmploymentTax(2025, [entry(100000, { employer: 'A', kind: 'PAYSLIP', month: '2025-01', insuranceReliefMinor: 400000 }), entry(100000, { employer: 'B', kind: 'PAYSLIP', month: '2025-01', insuranceReliefMinor: 400000 })]);
    expect(result.insuranceReliefMinor).toBe(500000);
    expect(result.insuranceCapped).toBe(true);
  });
  it('rejects mixed years, negative or unsafe amounts, and overlapping documents', () => {
    expect(() => calculateKenyaEmploymentTax(2026, [entry(100)])).toThrow();
    expect(() => calculateKenyaEmploymentTax(2025, [entry(-1)])).toThrow();
    expect(() => calculateKenyaEmploymentTax(2025, [entry(1, { payeMinor: Number.MAX_SAFE_INTEGER + 1 })])).toThrow();
    expect(() => calculateKenyaEmploymentTax(2025, [entry(1), entry(1, { employer: ' EXAMPLE   EMPLOYER ', kind: 'PAYSLIP', month: '2025-01' })])).toThrow(/Duplicate/);
    expect(() => calculateKenyaEmploymentTax(2025, [entry(1, { kind: 'PAYSLIP', month: '2026-01' })])).toThrow();
    expect(() => calculateKenyaEmploymentTax(2025, [entry(1, { kind: 'PAYSLIP', month: '2025-01' }), entry(1, { kind: 'PAYSLIP', month: '2025-01' })])).toThrow(/Duplicate/);
  });
  it('rounds using integer arithmetic', () => {
    expect(calculateKenyaEmploymentTax(2025, [entry(0, { chargeableMinor: 28800001 })]).taxBeforeReliefMinor).toBe(2880000);
  });
});
describe('document suggestions', () => {
  it('extracts only explicitly labelled unique figures', () => {
    const result = suggestTaxFigures('Tax year: 2025\nTotal chargeable pay (COL. K) KES 1,000,000.00\nTotal PAYE tax 200,000.00\nInsurance relief 0.00');
    expect(result.year).toBe(2025);
    expect(result.figures.chargeable?.value).toBe('1000000.00');
    expect(result.figures.paye?.value).toBe('200000.00');
    expect(result.figures.insurance?.value).toBe('0.00');
  });
  it('does not guess from P9 columns, repeated monthly rows, or tax charged', () => {
    expect(suggestTaxFigures('TOTAL 120000 30000 20000 10000').figures).toEqual({});
    expect(suggestTaxFigures('Taxable pay 100\nTaxable pay 200').figures.chargeable).toBeUndefined();
    expect(suggestTaxFigures('Tax charged 20000').figures.paye).toBeUndefined();
    expect(suggestTaxFigures('PAYE -2000\nTaxable pay: -1000\nInsurance relief = -50').figures).toEqual({});
    expect(suggestTaxFigures('PAYE 1,,234.00').figures.paye).toBeUndefined();
  });
  it('flags conflicting tax years instead of trusting the first page', () => {
    expect(suggestTaxFigures('Tax year: 2025\nTax year: 2024')).toMatchObject({ year: null, conflictingYears: true });
    expect(suggestTaxFigures('Tax year: 2025\nTax year: 2025')).toMatchObject({ year: 2025, conflictingYears: false });
  });
});
