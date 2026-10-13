// Dashboard numbers. Pure, so the nightly rollup and the web dashboard
// compute exactly the same thing (the dashboard re-runs it per date range).

import { daysBetween } from './dates';
import { methodInfo } from './methods';
import type { Payment } from './types';

export interface Bucket {
  label: string;
  openCount: number;
  openAmount: number;
  paidCount: number;
  paidAmount: number;
  avgDaysToPay: number | null;
}

export interface Summary {
  openCount: number;
  openAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number; // within the range
  paidAmount: number;
  avgDaysToPay: number | null;
  medianDaysToPay: number | null;
  byMethod: Record<string, Bucket>;
  byStageAtPayment: Record<string, number>;
  byCustomer: Record<string, Bucket>;
  byCategory: Record<string, Bucket>;
  insight: string | null;
}

type StatPayment = Pick<
  Payment,
  'status' | 'amount' | 'dueDate' | 'paidAt' | 'paidVia' | 'reminderStage' | 'customerId' | 'customerName' | 'category'
>;

export function daysToPay(p: Pick<Payment, 'dueDate' | 'paidAt'>): number {
  return p.paidAt ? Math.max(0, daysBetween(p.dueDate, p.paidAt)) : 0;
}

function emptyBucket(label: string): Bucket & { _days: number[] } {
  return { label, openCount: 0, openAmount: 0, paidCount: 0, paidAmount: 0, avgDaysToPay: null, _days: [] };
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];

export function computeStats(
  payments: StatPayment[],
  opts: { today: string; from?: string; to?: string },
): Summary {
  const from = opts.from ?? '0000-00-00';
  const to = opts.to ?? '9999-12-31';
  const s = {
    openCount: 0,
    openAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    paidCount: 0,
    paidAmount: 0,
  };
  const days: number[] = [];
  const byMethod: Record<string, ReturnType<typeof emptyBucket>> = {};
  const byCustomer: Record<string, ReturnType<typeof emptyBucket>> = {};
  const byCategory: Record<string, ReturnType<typeof emptyBucket>> = {};
  const byStageAtPayment: Record<string, number> = {};

  const bucket = (map: Record<string, ReturnType<typeof emptyBucket>>, key: string, label: string) =>
    (map[key] ??= emptyBucket(label));

  for (const p of payments) {
    if (p.status === 'canceled') continue;
    const cat = p.category?.trim() || 'Uncategorized';
    if (p.status !== 'paid') {
      s.openCount++;
      s.openAmount += p.amount;
      if (p.dueDate < opts.today) {
        s.overdueCount++;
        s.overdueAmount += p.amount;
      }
      for (const b of [bucket(byCustomer, p.customerId, p.customerName), bucket(byCategory, cat, cat)]) {
        b.openCount++;
        b.openAmount += p.amount;
      }
      continue;
    }
    if (!p.paidAt || p.paidAt < from || p.paidAt > to) continue;
    const d = daysToPay(p);
    s.paidCount++;
    s.paidAmount += p.amount;
    days.push(d);
    const method = p.paidVia || 'unknown';
    const methodLabel = method === 'unknown' ? 'Not recorded' : methodInfo(method).label;
    for (const b of [
      bucket(byMethod, method, methodLabel),
      bucket(byCustomer, p.customerId, p.customerName),
      bucket(byCategory, cat, cat),
    ]) {
      b.paidCount++;
      b.paidAmount += p.amount;
      b._days.push(d);
    }
    const stage = String(p.reminderStage ?? 0);
    byStageAtPayment[stage] = (byStageAtPayment[stage] ?? 0) + 1;
  }

  const finish = (map: Record<string, ReturnType<typeof emptyBucket>>) => {
    const out: Record<string, Bucket> = {};
    for (const [k, b] of Object.entries(map)) {
      const { _days, ...rest } = b;
      out[k] = { ...rest, avgDaysToPay: avg(_days) };
    }
    return out;
  };

  const summary: Summary = {
    ...s,
    avgDaysToPay: avg(days),
    medianDaysToPay: median(days),
    byMethod: finish(byMethod),
    byStageAtPayment,
    byCustomer: finish(byCustomer),
    byCategory: finish(byCategory),
    insight: null,
  };
  summary.insight = insight(summary);
  return summary;
}

/** One plain-language line, only when there is enough data to mean something. */
export function insight(s: Summary): string | null {
  const methods = Object.entries(s.byMethod)
    .filter(([k, b]) => k !== 'unknown' && b.paidCount >= 3 && b.avgDaysToPay !== null)
    .sort((a, b) => (a[1].avgDaysToPay as number) - (b[1].avgDaysToPay as number));
  if (methods.length >= 2) {
    const [fast, slow] = [methods[0][1], methods[methods.length - 1][1]];
    const diff = Math.round((slow.avgDaysToPay as number) - (fast.avgDaysToPay as number));
    if (diff >= 2) return `Customers who pay by ${fast.label} pay you ${diff} days faster than ${slow.label}.`;
  }
  const stages = Object.entries(s.byStageAtPayment);
  const total = stages.reduce((a, [, n]) => a + n, 0);
  if (total >= 5) {
    const [stage, n] = stages.sort((a, b) => b[1] - a[1])[0];
    if (n / total >= 0.4) {
      const k = Number(stage);
      if (k === 0) return 'Most of your customers pay before any reminder goes out.';
      return `Most of your payments come in after the ${ORDINAL[k - 1] ?? `#${k}`} reminder.`;
    }
  }
  return null;
}
