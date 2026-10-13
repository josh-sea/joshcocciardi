// A new job becomes one payment (or, for jobs created with a plan, the plan's
// installments are made by createPlan instead). Free accounts can have
// FREE_OPEN_JOB_LIMIT open jobs; past that the job is saved but its reminders
// stay paused until they upgrade or close another job.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { isPro, FREE_OPEN_JOB_LIMIT } from '../shared/billing';
import { isDateKey, todayKey } from '../shared/dates';
import { initialStage, nextReminderDate, openStatus } from '../shared/schedule';
import type { Job, Payment } from '../shared/types';
import { eventData } from '../lib/events';
import { db, eventsCol, jobsCol, paymentsCol } from '../lib/firebase';
import { loadUser } from '../lib/users';

export function paymentFromJob(uid: string, job: Job, amount: number, dueDate: string, extra: Partial<Payment> = {}): Payment {
  return {
    userId: uid,
    jobId: '',
    customerId: job.customerId,
    customerName: job.customerName,
    customerEmail: job.customerEmail,
    customerPhone: job.customerPhone,
    jobTitle: job.title,
    referenceNumber: job.referenceNumber,
    category: job.category,
    amount,
    dueDate,
    installment: null,
    paymentMethodType: null,
    status: 'scheduled',
    reminderStage: 0,
    lastReminderSent: null,
    nextReminderDue: null,
    paused: false,
    paidAt: null,
    paidVia: null,
    markedPaidAt: null,
    markedPaidBy: null,
    beforePaid: null,
    createdAt: Date.now(),
    ...extra,
  };
}

export const onJobCreate = onDocumentCreated(
  { document: 'ezpayze_users/{uid}/jobs/{jobId}' },
  async (event) => {
    const { uid, jobId } = event.params;
    const job = event.data?.data() as Job | undefined;
    if (!job || job.status !== 'open') return;
    const user = await loadUser(uid);
    if (!user) return;
    const today = todayKey(user.timezone);
    const dueDate = isDateKey(job.dueDate) ? job.dueDate : today;
    const amount = Number.isInteger(job.totalAmount) && job.totalAmount > 0 ? job.totalAmount : 0;

    let limitBlocked = false;
    if (!isPro(user.subscription)) {
      const open = await jobsCol(uid).where('status', '==', 'open').get();
      const others = open.docs.filter((d) => d.id !== jobId && !d.get('limitBlocked')).length;
      limitBlocked = others >= FREE_OPEN_JOB_LIMIT;
    }

    const ladderOpts = { reminderSchedule: user.reminderSchedule, courtesyNote: user.courtesyNote };
    const paymentRef = paymentsCol(uid).doc(`${jobId}_1`);
    const base = paymentFromJob(uid, job, amount, dueDate, { jobId, paused: limitBlocked });
    base.reminderStage = initialStage(base, ladderOpts, today);
    base.nextReminderDue = nextReminderDate(base, ladderOpts);
    base.status = openStatus(dueDate, today);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(paymentRef);
      if (existing.exists) return; // trigger retried
      tx.set(paymentRef, base);
      tx.set(eventsCol(uid, paymentRef.id).doc('created'), eventData('created', null, { source: job.source ?? 'manual' }));
      tx.update(jobsCol(uid).doc(jobId), {
        dueDate,
        totalAmount: amount,
        limitBlocked,
      });
    });
  },
);
