// "Split into payments": pick how many and how often; the schedule is shown
// in plain words before anything is saved.

import { useId, useState } from 'react';
import { addDays, longDate } from '@shared/dates';
import { formatMoney } from '@shared/money';
import { buildPlan, describePlan, MAX_PAYMENTS, MIN_PAYMENTS, nextFirstOfMonth } from '@shared/plan';
import type { PlanFrequency, PlanSpec } from '@shared/types';
import { Dialog } from './Dialog';
import { Field } from './Field';

const FREQS: { value: PlanFrequency; label: string }[] = [
  { value: 'monthly_first', label: 'Monthly, on the 1st' },
  { value: 'monthly_day', label: 'Monthly, on a day I pick' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'custom', label: 'I will pick each date' },
];

export function SplitDialog({ open, title, balance, today, initialCount = 3, confirmLabel = 'Split it up', onClose, onConfirm }: {
  open: boolean;
  title: string;
  balance: number;
  today: string;
  initialCount?: number;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (spec: PlanSpec) => Promise<void>;
}) {
  const base = useId();
  const [count, setCount] = useState(initialCount);
  const [frequency, setFrequency] = useState<PlanFrequency>('monthly_first');
  const [startDate, setStartDate] = useState(addDays(today, 7));
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [custom, setCustom] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const customDates = Array.from({ length: count }, (_, i) => custom[i] ?? '');
  const spec: PlanSpec = {
    count,
    frequency,
    startDate: frequency === 'monthly_first' ? today : startDate,
    dayOfMonth: frequency === 'monthly_day' ? dayOfMonth : undefined,
    customDates: frequency === 'custom' ? customDates : undefined,
  };
  const plan = buildPlan(balance, spec);

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p className="lead">Splitting <strong>{formatMoney(balance)}</strong>. Money still goes straight to you; we just send a reminder for each payment.</p>
      <div className="field">
        <label htmlFor={`${base}-count`}>How many payments?</label>
        <select id={`${base}-count`} value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {Array.from({ length: MAX_PAYMENTS - MIN_PAYMENTS + 1 }, (_, i) => i + MIN_PAYMENTS).map((n) => (
            <option key={n} value={n}>{n} payments</option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend>How often?</legend>
        <div className="tiles stack">
          {FREQS.map((f) => (
            <div className="tile" key={f.value}>
              <input type="radio" name={`${base}-freq`} id={`${base}-${f.value}`} checked={frequency === f.value} onChange={() => setFrequency(f.value)} />
              <label htmlFor={`${base}-${f.value}`}><span className="box" aria-hidden="true" />{f.label}</label>
            </div>
          ))}
        </div>
      </fieldset>
      {frequency === 'monthly_first' && <p className="hint">First payment due {longDate(nextFirstOfMonth(today))}.</p>}
      {frequency === 'monthly_day' && (
        <>
          <Field label="Day of the month (1 to 31)" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
          <Field label="First payment date" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </>
      )}
      {frequency === 'biweekly' && <Field label="First payment date" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
      {frequency === 'custom' &&
        customDates.map((d, i) => (
          <Field key={i} label={`Payment ${i + 1} date`} type="date" min={today} value={d} onChange={(e) => {
            const next = [...customDates];
            next[i] = e.target.value;
            setCustom(next);
          }} />
        ))}

      <div className={`card ${'rows' in plan ? 'good' : 'warn'}`} aria-live="polite">
        {'rows' in plan ? <strong>{describePlan(plan.rows, today)}.</strong> : <span>{plan.error}</span>}
      </div>
      <div className="stack">
        <button type="button" className="btn big block" disabled={!('rows' in plan) || busy} onClick={async () => {
          setBusy(true);
          try { await onConfirm(spec); } finally { setBusy(false); }
        }}>
          {busy ? 'Saving…' : confirmLabel}
        </button>
        <button type="button" className="btn secondary block" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}
