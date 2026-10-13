// "Split into payments." Pure metadata: the unpaid balance on a job becomes N
// dated installments, each reminded like any other payment. Money still goes
// straight from the customer to the owner.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { isPro } from '../shared/billing';
import { isDateKey, todayKey } from '../shared/dates';
import { buildPlan, describePlan, type PlanRow } from '../shared/plan';
import { initialStage, nextReminderDate, openStatus } from '../shared/schedule';
import type { EzUser, Job, Payment, PlanFrequency, PlanSpec } from '../shared/types';
import { eventData, logEventTx } from '../lib/events';
import { db, eventsCol, jobsCol, paymentsCol } from '../lib/firebase';
import { requireUser, str } from '../lib/users';
import { paymentFromJob } from '../jobs/onJobCreate';

const FREQUENCIES: PlanFrequency[] = ['monthly_first', 'monthly_day', 'biweekly', 'custom'];

export function parseSpec(d: Record<string, unknown>, today: string): PlanSpec {
  const frequency = FREQUENCIES.includes(d.frequency as PlanFrequency) ? (d.frequency as PlanFrequency) : 'monthly_first';
  return {
    count: Number(d.count),
    frequency,
    startDate: isDateKey(d.startDate) ? (d.startDate as string) : today,
    dayOfMonth: d.dayOfMonth !== undefined ? Number(d.dayOfMonth) : undefined,
    customDates: Array.isArray(d.customDates) ? d.customDates.filter(isDateKey).slice(0, 12) : undefined,
  };
}

/**
 * Inside a transaction: cancel the job's unpaid payments and create the
 * installments. Returns the rows so callers can describe the schedule.
 */
export async function applyPlan(
  tx: Transaction,
  uid: string,
  user: EzUser,
  jobId: string,
  spec: PlanSpec,
  today: string,
  meta: Record<string, unknown> = {},
): Promise<{ rows: PlanRow[]; description: string; job: Job }> {
  const jobRef = jobsCol(uid).doc(jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new HttpsError('not-found', 'That job is gone.');
  const job = jobSnap.data() as Job;
  if (job.status !== 'open') throw new HttpsError('failed-precondition', 'That job is already settled.');
  const pays = await tx.get(paymentsCol(uid).where('jobId', '==', jobId));
  const open = pays.docs.filter((d) => !['paid', 'canceled'].includes(d.get('status')));
  const balance = open.reduce((sum, d) => sum + Number(d.get('amount') ?? 0), 0);
  const plan = buildPlan(balance, spec);
  if ('error' in plan) throw new HttpsError('invalid-argument', plan.error);

  for (const d of open) {
    tx.update(d.ref, { status: 'canceled', nextReminderDue: null });
    logEventTx(tx, uid, d.id, 'canceled', null, { reason: 'replaced_by_plan' });
  }
  const ladderOpts = { reminderSchedule: user.reminderSchedule, courtesyNote: user.courtesyNote };
  const batchId = Date.now().toString(36);
  const firstOpen = open[0]?.data() as Payment | undefined;
  for (const row of plan.rows) {
    const ref = paymentsCol(uid).doc(`${jobId}_p${batchId}_${row.number}`);
    const p = paymentFromJob(uid, job, row.amount, row.dueDate, {
      jobId,
      installment: { number: row.number, of: row.of },
      paymentMethodType: firstOpen?.paymentMethodType ?? null,
      paused: !!firstOpen?.paused && !!job.limitBlocked,
      // Contact details may have been edited on the payment since job creation.
      customerEmail: firstOpen?.customerEmail ?? job.customerEmail,
      customerPhone: firstOpen?.customerPhone ?? job.customerPhone,
    });
    p.reminderStage = initialStage(p, ladderOpts, today);
    p.nextReminderDue = nextReminderDate(p, ladderOpts);
    p.status = openStatus(row.dueDate, today);
    tx.set(ref, p);
    tx.set(eventsCol(uid, ref.id).doc('created'), eventData('plan_created', null, { ...meta, of: row.of }));
  }
  tx.update(jobRef, { hasPlan: true });
  return { rows: plan.rows, description: describePlan(plan.rows, today), job };
}

export const createPlan = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  if (!isPro(user.subscription)) {
    throw new HttpsError('permission-denied', 'Payment plans are part of EzPayze Pro.');
  }
  const jobId = str(req.data?.jobId, 100);
  const today = todayKey(user.timezone);
  const spec = parseSpec(req.data ?? {}, today);
  const res = await db.runTransaction((tx) => applyPlan(tx, uid, user, jobId, spec, today, { by: 'owner' }));
  return { ok: true, rows: res.rows, description: res.description };
});
