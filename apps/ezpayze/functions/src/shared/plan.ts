// Payment plans are metadata only: a split of the amount owed into N dated
// installments. EzPayze never touches the money.

import { addDays, addMonths, isDateKey, shortDate } from './dates';
import { formatMoney } from './money';
import type { PlanSpec } from './types';

export const MIN_PAYMENTS = 2;
export const MAX_PAYMENTS = 12;

/** Even split in cents; the last payment absorbs any remainder. */
export function splitAmount(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] = total - base * (count - 1);
  return out;
}

/** The first of the month on or after `from`. */
export function nextFirstOfMonth(from: string): string {
  return from.endsWith('-01') ? from : addMonths(`${from.slice(0, 8)}01`, 1);
}

export function planDates(spec: PlanSpec): string[] {
  const n = spec.count;
  switch (spec.frequency) {
    case 'monthly_first': {
      const first = nextFirstOfMonth(spec.startDate);
      return Array.from({ length: n }, (_, i) => addMonths(first, i, 1));
    }
    case 'monthly_day': {
      const day = Math.min(31, Math.max(1, Math.round(spec.dayOfMonth ?? Number(spec.startDate.slice(8)))));
      return Array.from({ length: n }, (_, i) => addMonths(spec.startDate, i, day));
    }
    case 'biweekly':
      return Array.from({ length: n }, (_, i) => addDays(spec.startDate, i * 14));
    case 'custom':
      return [...(spec.customDates ?? [])].slice(0, n).sort();
  }
}

export interface PlanRow {
  number: number;
  of: number;
  amount: number;
  dueDate: string;
}

/** Validated schedule, or an error message in plain words. */
export function buildPlan(total: number, spec: PlanSpec): { rows: PlanRow[] } | { error: string } {
  if (!Number.isInteger(spec.count) || spec.count < MIN_PAYMENTS || spec.count > MAX_PAYMENTS) {
    return { error: `Pick between ${MIN_PAYMENTS} and ${MAX_PAYMENTS} payments.` };
  }
  if (!Number.isInteger(total) || total < spec.count) {
    return { error: 'There is not enough left owed to split up.' };
  }
  if (!isDateKey(spec.startDate)) return { error: 'Pick a start date.' };
  const dates = planDates(spec);
  if (dates.length !== spec.count || !dates.every(isDateKey)) {
    return { error: `Pick a date for each of the ${spec.count} payments.` };
  }
  if (new Set(dates).size !== dates.length) return { error: 'Each payment needs its own date.' };
  const amounts = splitAmount(total, spec.count);
  return {
    rows: dates.map((dueDate, i) => ({ number: i + 1, of: spec.count, amount: amounts[i], dueDate })),
  };
}

/** "4 payments of $250, due Nov 1, Dec 1, Jan 1, Feb 1" */
export function describePlan(rows: PlanRow[], today?: string): string {
  if (!rows.length) return '';
  const same = rows.every((r) => r.amount === rows[0].amount);
  const amountText = same
    ? `${rows.length} payments of ${formatMoney(rows[0].amount)}`
    : `${rows.length - 1} payments of ${formatMoney(rows[0].amount)} and a last payment of ${formatMoney(rows[rows.length - 1].amount)}`;
  const crossesYear = rows[0].dueDate.slice(0, 4) !== rows[rows.length - 1].dueDate.slice(0, 4);
  const ref = crossesYear ? undefined : today ?? rows[0].dueDate;
  return `${amountText}, due ${rows.map((r) => shortDate(r.dueDate, ref)).join(', ')}`;
}

/** Split options the public pay page suggests to a customer. */
export function suggestedCounts(total: number): number[] {
  return [2, 3, 4, 6].filter((n) => total >= n * 100);
}
