import { describe, expect, it } from 'vitest';
import { currentReportDate, currentReportMonth, reportMonths } from '../src/reports';

describe('report calendar periods', () => {
  it('includes six months in order across a year boundary', () => {
    expect(reportMonths('2026-02')).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('rejects invalid and oversized month input', () => {
    for (const value of ['2026-00', '2026-13', '2026-2', '2026-02-01', '9999-12']) expect(() => reportMonths(value)).toThrow();
  });
  it('defaults to the user timezone at a UTC month boundary', () => {
    const boundary = new Date('2026-10-31T22:00:00Z');
    expect(currentReportMonth('Africa/Nairobi', boundary)).toBe('2026-11');
    expect(currentReportDate('Africa/Nairobi', boundary)).toBe('2026-11-01');
    expect(currentReportMonth('America/New_York', boundary)).toBe('2026-10');
    expect(currentReportMonth('invalid-zone', boundary)).toBe('2026-10');
  });
});
