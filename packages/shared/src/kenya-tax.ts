/** 2025 resident employment-only worksheet. Values are KES cents. */
export const KENYA_TAX_RULES = {
  year: 2025, version: 'KE-2025-employment-v1', personalReliefMinor: 2880000,
  insuranceReliefCapMinor: 6000000,
  sources: [
    'https://www.kra.go.ke/individual/filing-paying/types-of-taxes/individual-income-tax',
    'https://www.kra.go.ke/images/publications/P9-FORM-Template-2025.pdf',
  ],
} as const;

export interface KenyaTaxEntry {
  employer: string;
  kind: 'P9' | 'PAYSLIP';
  month?: string;
  chargeableMinor: number;
  payeMinor: number;
  insuranceReliefMinor: number;
}

export function calculateKenyaEmploymentTax(year: number, entries: KenyaTaxEntry[]) {
  if (year !== 2025) throw new Error('Only the verified 2025 rules are supported.');
  if (!entries.length) throw new Error('Add at least one reviewed employment document.');
  const seen = new Map<string, Set<string>>();
  for (const entry of entries) {
    const employer = entry.employer.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!employer) throw new Error('Identify the employer for each document.');
    if (!['P9', 'PAYSLIP'].includes(entry.kind)) throw new Error('Choose P9 or payslip.');
    if (entry.kind === 'PAYSLIP' && !/^2025-(0[1-9]|1[0-2])$/.test(entry.month ?? '')) throw new Error('Choose a 2025 month for each payslip.');
    for (const amount of [entry.chargeableMinor, entry.payeMinor, entry.insuranceReliefMinor]) {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Enter non-negative amounts with at most two decimal places.');
    }
    const periods = seen.get(employer) ?? new Set<string>();
    const period = entry.kind === 'P9' ? 'annual' : entry.month!;
    if (periods.has(period) || periods.has('annual') || (period === 'annual' && periods.size > 0)) throw new Error('Duplicate coverage: use a P9 or monthly payslips for an employer, not both. Use one reviewed annual total per employer; do not combine overlapping or amended copies.');
    periods.add(period); seen.set(employer, periods);
  }
  const sum = (key: 'chargeableMinor' | 'payeMinor' | 'insuranceReliefMinor') => {
    const total = entries.reduce((value, entry) => value + BigInt(entry[key]), 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The combined amount exceeds the supported range.');
    return Number(total);
  };
  const chargeableMinor = sum('chargeableMinor');
  const payeMinor = sum('payeMinor');
  const insuranceClaimedMinor = sum('insuranceReliefMinor');
  const monthlyInsurance = new Map<string, number>();
  let annualInsurance = 0;
  for (const entry of entries) {
    if (entry.kind === 'P9') annualInsurance += entry.insuranceReliefMinor;
    else monthlyInsurance.set(entry.month!, (monthlyInsurance.get(entry.month!) ?? 0) + entry.insuranceReliefMinor);
  }
  const insuranceReliefMinor = Math.min(KENYA_TAX_RULES.insuranceReliefCapMinor,
    annualInsurance + [...monthlyInsurance.values()].reduce((sum, amount) => sum + Math.min(500000, amount), 0));
  const thresholds = [[28800000, 1000], [10000000, 2500], [561200000, 3000], [360000000, 3250], [Number.MAX_SAFE_INTEGER, 3500]] as const;
  let remaining = chargeableMinor;
  let numerator = 0n;
  const bands = thresholds.map(([width, basisPoints]) => {
    const amountMinor = Math.min(remaining, width);
    remaining -= amountMinor;
    numerator += BigInt(amountMinor) * BigInt(basisPoints);
    return { amountMinor, rate: basisPoints / 100 };
  });
  const taxBeforeReliefMinor = Number((numerator + 5000n) / 10000n);
  const taxAfterReliefMinor = Math.max(0, taxBeforeReliefMinor - KENYA_TAX_RULES.personalReliefMinor - insuranceReliefMinor);
  return { year, ruleVersion: KENYA_TAX_RULES.version, chargeableMinor, payeMinor, taxBeforeReliefMinor,
    personalReliefMinor: KENYA_TAX_RULES.personalReliefMinor, insuranceReliefMinor,
    insuranceCapped: insuranceClaimedMinor > insuranceReliefMinor,
    taxAfterReliefMinor, balanceMinor: taxAfterReliefMinor - payeMinor, bands };
}

/** Suggestions only. Never guess which column of an unlabeled P9 table is a total. */
export function suggestTaxFigures(text: string) {
  const lines = text.replace(/\r/g, '').split('\n');
  const patterns = {
    chargeable: /^(?:total\s+)?(?:chargeable|taxable)\s+(?:pay|income)(?:\s*\(col\.?\s*k\))?\s*[:=]?\s*(?:kshs?\.?|kes)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*$/i,
    paye: /^(?:total\s+)?(?:paye(?:\s+tax)?|tax\s+deducted|tax\s*\(col\.?\s*o\))\s*[:=]?\s*(?:kshs?\.?|kes)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*$/i,
    insurance: /^(?:total\s+)?insurance\s+relief\s*[:=]?\s*(?:kshs?\.?|kes)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*$/i,
  };
  const result: Partial<Record<keyof typeof patterns, { value: string; source: string }>> = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = lines.flatMap((line) => { const match = line.trim().match(pattern); return match ? [{ value: match[1]!.replace(/,/g, ''), source: line.trim() }] : []; });
    if (matches.length === 1) result[key as keyof typeof patterns] = matches[0];
  }
  const years = [...new Set([...text.matchAll(/(?:tax\s+year|year\s+of\s+income|deduction\s+card\s+year)\s*[:-]?\s*(20\d{2})/gi)].map((match) => Number(match[1])))];
  return { figures: result, year: years.length === 1 ? years[0]! : null, conflictingYears: years.length > 1 };
}
