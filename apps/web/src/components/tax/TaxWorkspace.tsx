'use client';

import { useEffect, useRef, useState } from 'react';
import { calculateKenyaEmploymentTax, formatMoney, KENYA_TAX_RULES, parseMoneyToMinorUnits, suggestTaxFigures, type KenyaTaxEntry } from '@moneypilot/shared';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { readTaxDocument } from '@/lib/tax-documents';

type Draft = { id: number; employer: string; kind: 'P9' | 'PAYSLIP'; month: string; chargeable: string; paye: string; insurance: string; text: string; source: string; reviewed: boolean; wrongYear: boolean };
const money = (amount: number) => formatMoney(amount, 'KES');
const initial = (id: number): Draft => ({ id, employer: '', kind: 'P9', month: '', chargeable: '', paye: '', insurance: '', text: '', source: 'Manual entry', reviewed: false, wrongYear: false });
const csvCell = (value: string) => '"' + (/^[\s=+\-@]/.test(value) ? "'" : '') + value.replace(/"/g, '""') + '"';

export function TaxWorkspace() {
  const [drafts, setDrafts] = useState<Draft[]>([initial(1)]);
  const [scope, setScope] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof calculateKenyaEmploymentTax> | null>(null);
  const reader = useRef<AbortController | null>(null);
  const nextId = useRef(2);
  useEffect(() => () => reader.current?.abort(), []);
  const change = (id: number, patch: Partial<Draft>) => { setDrafts((items) => items.map((item) => item.id === id ? { ...item, ...patch, reviewed: patch.reviewed ?? false } : item)); setResult(null); setComplete(false); };
  async function upload(id: number, file: File) {
    const controller = new AbortController();
    reader.current = controller;
    change(id, { reviewed: false });
    setBusy(id); setError(null); setStatus('Preparing local document reader…'); setResult(null);
    try {
      const text = await readTaxDocument(file, (message) => { if (!controller.signal.aborted) setStatus(message); }, controller.signal);
      if (controller.signal.aborted) return;
      if (!text.trim()) throw new Error('No readable text found. Enter the figures manually or upload a clearer copy.');
      const suggested = suggestTaxFigures(text);
      change(id, { text, source: file.name, wrongYear: suggested.conflictingYears || (suggested.year !== null && suggested.year !== 2025),
        chargeable: suggested.figures.chargeable?.value ?? '', paye: suggested.figures.paye?.value ?? '', insurance: suggested.figures.insurance?.value ?? '' });
      setStatus('Document read locally. Check every figure against the source before confirming. Unrecognized or ambiguous fields are left blank.');
    } catch {
      if (!controller.signal.aborted) {
        setStatus('');
        setError('The document could not be read completely. Try a smaller, clearer PDF/image, or enter its totals manually. Password-protected files must be unlocked first. Previous figures must be reviewed again.');
      }
    }
    finally { if (!controller.signal.aborted) { reader.current = null; setBusy(null); } }
  }
  function entries(): KenyaTaxEntry[] {
    return drafts.map((item) => {
      if (!item.reviewed || item.wrongYear) throw new Error('Review every document and resolve any tax-year mismatch first.');
      const parse = (value: string) => {
        if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Fill every amount using up to two decimals, without commas. Enter 0 where none applies.');
        return parseMoneyToMinorUnits(value, 'KES');
      };
      return { employer: item.employer, kind: item.kind, month: item.month, chargeableMinor: parse(item.chargeable), payeMinor: parse(item.paye), insuranceReliefMinor: parse(item.insurance) };
    });
  }
  function calculate() {
    setError(null); setResult(null);
    try {
      if (!scope) throw new Error('Confirm that the supported resident employment-only scope applies.');
      setResult(calculateKenyaEmploymentTax(2025, entries()));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the worksheet figures.'); }
  }
  function download() {
    if (!result || !complete || !scope) return;
    const rows = [['MoneyPilot 2025 employment worksheet', result.ruleVersion], ['Status', 'Reviewed worksheet; reconcile on iTax. Not a submitted return.'], ['Employer', 'Document', 'Period', 'Chargeable pay KES', 'PAYE deducted KES', 'Insurance relief KES'],
      ...entries().map((entry) => [entry.employer, entry.kind, entry.kind === 'P9' ? '2025 annual' : entry.month!, (entry.chargeableMinor / 100).toFixed(2), (entry.payeMinor / 100).toFixed(2), (entry.insuranceReliefMinor / 100).toFixed(2)]),
      ['Combined chargeable income', (result.chargeableMinor / 100).toFixed(2)], ['Tax before relief', (result.taxBeforeReliefMinor / 100).toFixed(2)], ['Personal relief', (result.personalReliefMinor / 100).toFixed(2)], ['Insurance relief applied', (result.insuranceReliefMinor / 100).toFixed(2)], ['Tax after relief', (result.taxAfterReliefMinor / 100).toFixed(2)], ['PAYE deducted', (result.payeMinor / 100).toFixed(2)], ['Estimated balance (negative = potential overpayment)', (result.balanceMinor / 100).toFixed(2)], ['Rules source', KENYA_TAX_RULES.sources[0]]];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'MoneyPilot-2025-tax-worksheet.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-8">
    <header className="border-b border-line pb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h1 className="text-3xl font-semibold tracking-tight">Tax preparation</h1><span className="text-sm text-muted">Kenya · Year of income 2025</span></div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body">Turn your P9 and payslips into a checked employment-income worksheet. Review the figures here, then reconcile and submit your return on iTax.</p>
    </header>
    <div className="grid gap-3 border-b border-line pb-6 text-sm sm:grid-cols-3"><p><span className="mr-2 font-mono text-faint">01</span> Read your documents</p><p><span className="mr-2 font-mono text-faint">02</span> Check the figures</p><p><span className="mr-2 font-mono text-faint">03</span> Prepare your worksheet</p></div>
    <section aria-labelledby="tax-scope" className="max-w-prose space-y-3">
      <h2 id="tax-scope" className="text-lg font-semibold">Before you start</h2>
      <p className="text-sm text-muted">2025 rules only. This version covers individuals resident in Kenya throughout the year with ordinary employment income only. Other income, non-residence, disability exemptions, foreign tax credits, terminal benefits and other special treatment need a separate review. Penalties and interest are not calculated.</p>
      <label className="flex items-start gap-3 text-sm"><input id="tax-scope-confirm" type="checkbox" checked={scope} onChange={(event) => { setScope(event.target.checked); setResult(null); }} className="mt-1 h-4 w-4 shrink-0" /><span>I was resident in Kenya throughout 2025 and only have ordinary employment income to declare.</span></label>
      <p className="text-xs leading-relaxed text-muted">Files and extracted text stay in this browser session. Nothing is uploaded to MoneyPilot or an AI service. Closing or reloading this page clears your worksheet; download it when ready. Use Clear worksheet on a shared computer.</p>
    </section>
    {error ? <Alert variant="error">{error}</Alert> : null}
    <p role="status" aria-live="polite" className="text-sm text-muted">{status}</p>
    {busy !== null ? <Button type="button" variant="outline" onClick={() => { reader.current?.abort(); reader.current = null; setBusy(null); setStatus('Reading cancelled. Review the previous figures before calculating.'); }}>Cancel reading</Button> : null}
    <section aria-labelledby="tax-documents" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="tax-documents" className="text-lg font-semibold">Employment documents</h2><Button type="button" variant="outline" disabled={busy !== null || drafts.length >= 24} onClick={() => { setDrafts([...drafts, initial(nextId.current++)]); setResult(null); setComplete(false); }}>Add employer / payslip</Button></div>
      <p className="text-sm text-muted">Use one annual P9 per employer, or one payslip per month. Do not count a P9 and its supporting payslips twice. You can read a supporting document separately and remove it before calculating.</p>
      {drafts.map((item, index) => <article key={item.id} className="border border-line bg-surface" aria-label={`Employment document ${index + 1}`}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h3 className="text-sm font-semibold">Document {String(index + 1).padStart(2, '0')}</h3><Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setDrafts(drafts.filter((draft) => draft.id !== item.id)); setResult(null); setComplete(false); }}>Remove</Button></div>
        <fieldset disabled={busy === item.id} className="min-w-0 space-y-5 p-4 sm:p-6">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Employer name or label" htmlFor={`employer-${item.id}`}><Input id={`employer-${item.id}`} value={item.employer} maxLength={120} autoComplete="off" onChange={(event) => change(item.id, { employer: event.target.value })} /></Field>
            <Field label="Document type" htmlFor={`kind-${item.id}`}><Select id={`kind-${item.id}`} value={item.kind} onChange={(event) => change(item.id, { kind: event.target.value as Draft['kind'] })}><option value="P9">Annual P9</option><option value="PAYSLIP">Monthly payslip</option></Select></Field>
            {item.kind === 'PAYSLIP' ? <Field label="Payslip month" htmlFor={`month-${item.id}`}><Input id={`month-${item.id}`} type="month" min="2025-01" max="2025-12" value={item.month} onChange={(event) => change(item.id, { month: event.target.value })} /></Field> : null}
          </div>
          <Field label="Read a PDF or image on this device (optional)" htmlFor={`file-${item.id}`}><input id={`file-${item.id}`} type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy !== null} className="block w-full min-w-0 text-sm file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-heading" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(item.id, file); }} /><p className="mt-2 text-xs text-muted">PDF, PNG or JPEG · 10 MB maximum. Scans use local OCR and may take a minute. Suggestions require your review; P9 tables may need manual entry.</p></Field>
          {item.wrongYear ? <Alert variant="warning">The document appears to be for another tax year. Remove it and choose a 2025 document, or correct the source before proceeding.</Alert> : null}
          {item.text ? <details className="border-l-2 border-line pl-3"><summary className="cursor-pointer text-sm font-medium">Source text · {item.source}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{item.text}</pre><p className="mt-2 text-xs text-muted">Review against the original file. OCR text is not proof that a figure was read correctly.</p></details> : null}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="Chargeable pay (KES)" htmlFor={`chargeable-${item.id}`} hint="P9 column K total, after allowable deductions. Payslip: taxable pay. Do not subtract deductions again."><Input id={`chargeable-${item.id}`} inputMode="decimal" value={item.chargeable} onChange={(event) => change(item.id, { chargeable: event.target.value })} /></Field>
            <Field label="PAYE deducted (KES)" htmlFor={`paye-${item.id}`} hint="P9 column O total or actual PAYE on the payslip. Not gross tax charged."><Input id={`paye-${item.id}`} inputMode="decimal" value={item.paye} onChange={(event) => change(item.id, { paye: event.target.value })} /></Field>
            <Field label="Eligible insurance relief (KES)" htmlFor={`insurance-${item.id}`} hint="Relief amount from P9 column N, not premiums paid. Enter 0 if none. SHIF is not entered as insurance relief."><Input id={`insurance-${item.id}`} inputMode="decimal" value={item.insurance} onChange={(event) => change(item.id, { insurance: event.target.value })} /></Field>
          </div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={item.reviewed} onChange={(event) => change(item.id, { reviewed: event.target.checked })} className="mt-1 h-4 w-4 shrink-0" /><span>I checked the employer, year, period and every amount against the original document. Zero amounts are intentional.</span></label>
        </fieldset>
      </article>)}
    </section>
    <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy !== null} onClick={calculate}>Calculate worksheet</Button><Button type="button" variant="ghost" disabled={busy !== null} onClick={() => { setDrafts([initial(nextId.current++)]); setResult(null); setError(null); setStatus('Worksheet cleared from this page. Any downloaded copies remain on your device.'); setComplete(false); setScope(false); }}>Clear worksheet</Button></div>
    {result ? <section aria-labelledby="tax-result" className="space-y-5 border-t-2 border-heading pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="tax-result" className="text-xl font-semibold">Your 2025 worksheet</h2><span className="font-mono text-xs text-muted">{result.ruleVersion}</span></div>
      <Alert variant="warning">Estimate from the documents entered, without annualising missing months. It is incomplete until all employment income is included. Reconcile with iTax; a potential overpayment is not an approved refund.</Alert>
      <dl className="divide-y divide-line border-y border-line">
        {[
          ['Combined chargeable income', result.chargeableMinor], ['Tax before relief', result.taxBeforeReliefMinor], ['Personal relief (applied once)', result.personalReliefMinor], ['Insurance relief applied', result.insuranceReliefMinor], ['Tax after relief', result.taxAfterReliefMinor], ['PAYE deducted', result.payeMinor], [result.balanceMinor >= 0 ? 'Estimated tax balance' : 'Potential overpayment', Math.abs(result.balanceMinor)],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><dt>{label}</dt><dd className="font-mono tabular-nums">{money(Number(value))}</dd></div>)}
      </dl>
      {result.insuranceCapped ? <p className="text-sm text-muted">Insurance relief was limited to KSh 5,000 per payslip month and KSh 60,000 for the year. Confirm eligibility against the original documents.</p> : null}
      <details><summary className="cursor-pointer text-sm font-semibold">How the annual tax bands were applied</summary><ul className="mt-3 space-y-2 text-sm">{result.bands.filter((band) => band.amountMinor > 0).map((band) => <li key={band.rate}>{money(band.amountMinor)} at {band.rate}%</li>)}</ul></details>
      <label className="flex items-start gap-3 text-sm"><input id="tax-complete" type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>I included all employers and all 2025 employment income, checked there is no overlap, and any months not represented had no employment income.</span></label>
      <div className="flex flex-wrap items-center gap-4"><Button type="button" disabled={!complete} onClick={download}>Download reviewed worksheet</Button><a href="https://itax.kra.go.ke/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary-700 dark:text-primary-300">Open KRA iTax ↗</a></div>
      <p className="text-xs text-muted">CSV worksheet for reference, not an iTax upload file. MoneyPilot does not sign in to KRA, submit returns, or request your PIN/password.</p>
    </section> : null}
    <footer className="border-t border-line pt-4 text-xs leading-relaxed text-muted">Rules checked 1 November 2026 for year of income 2025. <a className="underline" href={KENYA_TAX_RULES.sources[0]} target="_blank" rel="noreferrer">KRA annual bands and personal relief</a> · <a className="underline" href={KENYA_TAX_RULES.sources[1]} target="_blank" rel="noreferrer">KRA 2025 P9 and insurance relief guidance</a>. Verify eligibility and employer-reported deductions on iTax before submission.</footer>
  </div>;
}
