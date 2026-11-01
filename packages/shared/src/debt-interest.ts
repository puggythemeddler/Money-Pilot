export type DebtInterestMethod = 'NONE' | 'INCLUDED' | 'FLAT' | 'REDUCING';
export interface DebtInterestTerms {
  interestMethod: string;
  interestPeriod: string;
  interestRate: string | null;
  startDate: string | null;
  termMonths: number | null;
}

export function validCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Full-term fixed-rate estimate, not daily accrual or an early-settlement quote. */
export function calculateDebtInterest(principalMinor: number, terms: DebtInterestTerms) {
  if (!Number.isSafeInteger(principalMinor) || principalMinor <= 0) throw new Error('Enter a positive amount within the supported range.');
  if (!['NONE', 'INCLUDED', 'FLAT', 'REDUCING'].includes(terms.interestMethod)) throw new Error('Choose how interest is handled.');
  if (!['ANNUAL', 'MONTHLY'].includes(terms.interestPeriod)) throw new Error('Choose a monthly or annual interest rate.');
  const projected = terms.interestMethod === 'FLAT' || terms.interestMethod === 'REDUCING';
  if (!projected) return { interestMinor: 0, totalRepayableMinor: principalMinor, monthlyPaymentMinor: null, projected: false };
  if (!terms.startDate || !validCalendarDate(terms.startDate)) throw new Error('Choose a valid loan start date.');
  const months = terms.termMonths;
  if (!months || !Number.isInteger(months) || months < 1 || months > 600) throw new Error('Enter a loan duration between 1 and 600 months.');
  if (!terms.interestRate || !/^\d+(?:\.\d{1,2})?$/.test(terms.interestRate) || Number(terms.interestRate) > 1000) throw new Error('Enter an interest rate between 0 and 1000%, with up to two decimals.');
  const [whole, fraction = ''] = terms.interestRate.split('.');
  const rate = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  const denominator = terms.interestPeriod === 'ANNUAL' ? 120000n : 10000n;
  const principal = BigInt(principalMinor);
  const round = (n: bigint, d: bigint) => (n + d / 2n) / d;
  let interest = 0n;
  let payment: bigint;
  if (terms.interestMethod === 'FLAT') {
    interest = round(principal * rate * BigInt(months), denominator);
    payment = (principal + interest + BigInt(months) - 1n) / BigInt(months);
  } else {
    const growth = (denominator + rate) ** BigInt(months);
    const base = denominator ** BigInt(months);
    // Round the regular instalment up; adjust the final payment to the balance.
    const numerator = principal * rate * growth;
    const divisor = denominator * (growth - base);
    payment = rate === 0n ? (principal + BigInt(months) - 1n) / BigInt(months) : (numerator + divisor - 1n) / divisor;
    let balance = principal;
    for (let month = 0; month < months && balance > 0n; month++) {
      const charged = round(balance * rate, denominator);
      interest += charged;
      balance = month === months - 1 ? 0n : balance + charged - (payment < balance + charged ? payment : balance + charged);
    }
  }
  if (principal + interest > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The repayment total exceeds the supported range.');
  return { interestMinor: Number(interest), totalRepayableMinor: Number(principal + interest), monthlyPaymentMinor: Number(payment), projected: true };
}
