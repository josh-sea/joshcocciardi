// The reminder ladder: which reminders a payment gets, and when.
//
// A ladder is a list of steps, each an offset in days from the due date. The
// payment's reminderStage counts the steps already sent, so the next one is
// ladder[reminderStage]. When the ladder runs out, nextReminderDue is null and
// the payment leaves the daily scan.

import { addDays } from './dates';
import type { Payment, ReminderKind } from './types';

export const DEFAULT_SCHEDULE = [7, 14, 30];
// Plan installments get a heads-up this many days before each due date.
export const INSTALLMENT_HEADS_UP_DAYS = 3;

export interface LadderStep {
  offsetDays: number;
  kind: ReminderKind;
}

export interface LadderOptions {
  reminderSchedule?: number[];
  courtesyNote?: boolean;
}

export function cleanSchedule(days: unknown): number[] {
  if (!Array.isArray(days)) return [...DEFAULT_SCHEDULE];
  const out = [...new Set(days.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 365))];
  out.sort((a, b) => a - b);
  return out.length ? out.slice(0, 6) : [...DEFAULT_SCHEDULE];
}

export function buildLadder(opts: LadderOptions, isInstallment: boolean): LadderStep[] {
  const days = cleanSchedule(opts.reminderSchedule);
  const steps: LadderStep[] = [];
  if (isInstallment) steps.push({ offsetDays: -INSTALLMENT_HEADS_UP_DAYS, kind: 'courtesy' });
  else if (opts.courtesyNote) steps.push({ offsetDays: 0, kind: 'courtesy' });
  days.forEach((offsetDays, i) => {
    const last = i === days.length - 1;
    const kind: ReminderKind = last && days.length > 1 ? 'final' : i === 0 ? 'friendly' : 'firm';
    steps.push({ offsetDays, kind });
  });
  return steps;
}

/** The step a payment will send next, or null once the ladder is done. */
export function nextStep(
  payment: Pick<Payment, 'dueDate' | 'reminderStage' | 'installment'>,
  opts: LadderOptions,
): (LadderStep & { date: string; stage: number }) | null {
  const ladder = buildLadder(opts, !!payment.installment);
  const step = ladder[payment.reminderStage];
  if (!step) return null;
  return { ...step, stage: payment.reminderStage, date: addDays(payment.dueDate, step.offsetDays) };
}

export function nextReminderDate(
  payment: Pick<Payment, 'dueDate' | 'reminderStage' | 'installment'>,
  opts: LadderOptions,
): string | null {
  return nextStep(payment, opts)?.date ?? null;
}

/**
 * Where a new (or re-opened) payment starts on the ladder. A heads-up whose
 * day has already passed is skipped: nobody needs "this is due soon" about
 * something that is already late.
 */
export function initialStage(
  payment: Pick<Payment, 'dueDate' | 'installment'>,
  opts: LadderOptions,
  today: string,
): number {
  const ladder = buildLadder(opts, !!payment.installment);
  let stage = 0;
  while (ladder[stage]?.kind === 'courtesy' && addDays(payment.dueDate, ladder[stage].offsetDays) < today) stage++;
  return stage;
}

// After a send, the next reminder is never sooner than this. It only matters
// when catching up on a job added long after its due date, so a customer
// never gets the whole ladder on back-to-back days.
export const MIN_DAYS_BETWEEN_REMINDERS = 3;

export function nextAfterSend(
  payment: Pick<Payment, 'dueDate' | 'reminderStage' | 'installment'>,
  opts: LadderOptions,
  today: string,
): string | null {
  const next = nextReminderDate({ ...payment, reminderStage: payment.reminderStage + 1 }, opts);
  if (!next) return null;
  const earliest = addDays(today, MIN_DAYS_BETWEEN_REMINDERS);
  return next < earliest ? earliest : next;
}

/** Status a still-unpaid payment should show on a given day. */
export function openStatus(dueDate: string, today: string): 'scheduled' | 'due' | 'overdue' {
  if (dueDate > today) return 'scheduled';
  if (dueDate === today) return 'due';
  return 'overdue';
}

export function describeSchedule(days: number[]): string {
  const d = cleanSchedule(days);
  if (d.length === 1) return `${d[0]} days late`;
  return `${d.slice(0, -1).join(', ')}${d.length > 2 ? ',' : ''} and ${d[d.length - 1]} days late`;
}
