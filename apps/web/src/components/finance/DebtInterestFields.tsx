'use client';

import { calculateDebtInterest, formatMoney, type DebtInterestTerms } from '@moneypilot/shared';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';

export function DebtInterestFields({ id, value, onChange, principalMinor, currency }: {
  id: string; value: DebtInterestTerms; onChange: (patch: Partial<DebtInterestTerms>) => void;
  principalMinor: number | null; currency: string;
}) {
  const active = ['FLAT', 'REDUCING'].includes(value.interestMethod);
  let estimate: ReturnType<typeof calculateDebtInterest> | null = null;
  let guidance = '';
  try { if (principalMinor !== null) estimate = calculateDebtInterest(principalMinor, value); }
  catch (error) { guidance = (error as Error).message; }
  return <fieldset className="col-span-full min-w-0 space-y-4 border-y border-line py-4">
    <legend className="px-1 text-sm font-semibold">Interest and duration</legend>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="How should interest be handled?" htmlFor={`${id}-method`}>
        <Select id={`${id}-method`} value={value.interestMethod} onChange={(event) => onChange({ interestMethod: event.target.value })}>
          <option value="NONE">Track entered amount only</option><option value="INCLUDED">Entered amount already includes interest</option>
          <option value="FLAT">Add flat interest</option><option value="REDUCING">Add reducing-balance interest</option>
        </Select>
      </Field>
      <Field label={active ? 'Interest rate (%)' : 'Reference rate (%) (optional)'} htmlFor={`${id}-rate`}>
        <Input id={`${id}-rate`} value={value.interestRate ?? ''} inputMode="decimal" required={active} onChange={(event) => onChange({ interestRate: event.target.value })} />
      </Field>
      <Field label="Rate period" htmlFor={`${id}-period`}><Select id={`${id}-period`} value={value.interestPeriod} onChange={(event) => onChange({ interestPeriod: event.target.value })}><option value="ANNUAL">Annual</option><option value="MONTHLY">Monthly</option></Select></Field>
      {active ? <>
        <Field label="Loan start date" htmlFor={`${id}-start`}><Input id={`${id}-start`} type="date" required value={value.startDate ?? ''} onChange={(event) => onChange({ startDate: event.target.value || null })} /></Field>
        <Field label="Duration (months)" htmlFor={`${id}-term`}><Input id={`${id}-term`} type="number" min={1} max={600} step={1} required value={value.termMonths ?? ''} onChange={(event) => onChange({ termMonths: event.target.value ? Number(event.target.value) : null })} /></Field>
      </> : null}
    </div>
    <p className="max-w-prose text-xs leading-relaxed text-muted">{active
      ? 'Enter the original principal excluding interest. Flat interest uses that principal for the whole term. Reducing-balance interest assumes equal monthly instalments starting one month after the start date, with a final rounding adjustment. Payments reduce the estimated total; they do not recalculate the original schedule.'
      : 'No extra interest will be added. Existing debts keep their entered amount unless you explicitly choose a calculation above.'}</p>
    {active && estimate ? <dl aria-label="Interest preview" className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-muted">Full-term interest estimate</dt><dd className="font-semibold tabular-nums">{formatMoney(estimate.interestMinor, currency)}</dd></div>
      <div><dt className="text-muted">Total repayable estimate</dt><dd className="font-semibold tabular-nums">{formatMoney(estimate.totalRepayableMinor, currency)}</dd></div>
      <div><dt className="text-muted">Monthly instalment estimate</dt><dd className="font-semibold tabular-nums">{formatMoney(estimate.monthlyPaymentMinor!, currency)}</dd></div>
    </dl> : active ? <p className="text-sm text-muted">{guidance || 'Enter the principal and loan terms to preview interest.'}</p> : null}
    {active ? <p className="max-w-prose text-xs leading-relaxed text-muted">This adds estimated interest for the entire term to the tracked debt. It is not interest accrued to today or a lender settlement quote. Fees, penalties, variable rates and early-repayment savings are excluded. Check the terms against your lender’s statement before saving.</p> : null}
  </fieldset>;
}
