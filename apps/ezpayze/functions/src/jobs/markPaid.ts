// "Got paid" and its Undo. Marking paid takes the payment out of the scan
// (nextReminderDue = null), drops it from today's send, and closes the job
// once every payment on it is settled.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { isDateKey, todayKey } from '../shared/dates';
import type { Payment, QueueDay, QueueItemState } from '../shared/types';
import { logEventTx } from '../lib/events';
import { db, jobsCol, paymentsCol, queueCol } from '../lib/firebase';
import { requireUser, str } from '../lib/users';

export const UNDO_WINDOW_MS = 60 * 60 * 1000;

/** Set one item's state on today's list, if it's there and not already sent. */
export async function setQueueItemState(
  tx: Transaction,
  uid: string,
  today: string,
  paymentId: string,
  state: QueueItemState,
  onlyFrom?: QueueItemState[],
) {
  const ref = queueCol(uid).doc(today);
  const snap = await tx.get(ref);
  if (!snap.exists) return () => undefined;
  const day = snap.data() as QueueDay;
  let changed = false;
  const items = day.items.map((i) => {
    if (i.paymentId !== paymentId || i.state === 'sent') return i;
    if (onlyFrom && !onlyFrom.includes(i.state)) return i;
    changed = true;
    return { ...i, state };
  });
  // Reads must all happen before writes in a transaction, so hand back the write.
  return () => {
    if (changed) tx.update(ref, { items });
  };
}

async function jobPaymentsSettled(tx: Transaction, uid: string, jobId: string, override: { id: string; status: string }) {
  const all = await tx.get(paymentsCol(uid).where('jobId', '==', jobId));
  return all.docs.every((d) => {
    const status = d.id === override.id ? override.status : (d.get('status') as string);
    return status === 'paid' || status === 'canceled';
  });
}

export const markPaid = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const paymentId = str(req.data?.paymentId, 100);
  const paidVia = str(req.data?.paidVia, 40) || null;
  const today = todayKey(user.timezone);
  const paidAt = isDateKey(req.data?.paidAt) && req.data.paidAt <= today ? (req.data.paidAt as string) : today;
  if (!paymentId) throw new HttpsError('invalid-argument', 'Which payment?');
  const ref = paymentsCol(uid).doc(paymentId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That payment is gone.');
    const p = snap.data() as Payment;
    if (p.status === 'paid') return { already: true, jobId: p.jobId };
    if (p.status === 'canceled') throw new HttpsError('failed-precondition', 'That payment was canceled.');
    const settled = await jobPaymentsSettled(tx, uid, p.jobId, { id: paymentId, status: 'paid' });
    const writeQueue = await setQueueItemState(tx, uid, today, paymentId, 'paid');
    tx.update(ref, {
      status: 'paid',
      paidAt,
      paidVia,
      markedPaidAt: Date.now(),
      markedPaidBy: 'owner',
      nextReminderDue: null,
      beforePaid: { status: p.status, nextReminderDue: p.nextReminderDue },
    });
    if (settled) tx.update(jobsCol(uid).doc(p.jobId), { status: 'paid' });
    writeQueue();
    logEventTx(tx, uid, paymentId, 'marked_paid', p.reminderStage, { paidVia, paidAt });
    return { already: false, jobId: p.jobId };
  });
  return { ok: true, ...result, undoUntil: Date.now() + UNDO_WINDOW_MS };
});

export const undoMarkPaid = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const paymentId = str(req.data?.paymentId, 100);
  if (!paymentId) throw new HttpsError('invalid-argument', 'Which payment?');
  const force = req.data?.force === true;
  const today = todayKey(user.timezone);
  const ref = paymentsCol(uid).doc(paymentId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That payment is gone.');
    const p = snap.data() as Payment;
    if (p.status !== 'paid') return;
    // The Undo toast is time-limited; "Not paid after all" on the job page
    // passes force and works any time.
    const expired = !p.markedPaidAt || Date.now() - p.markedPaidAt > UNDO_WINDOW_MS;
    if (!force && expired) {
      throw new HttpsError('failed-precondition', 'It is too late to undo this one. Open the job to change it.');
    }
    const jobRef = jobsCol(uid).doc(p.jobId);
    const job = await tx.get(jobRef);
    const writeQueue = await setQueueItemState(tx, uid, today, paymentId, 'pending', ['paid']);
    const before = p.beforePaid ?? { status: 'overdue', nextReminderDue: today };
    tx.update(ref, {
      status: before.status,
      nextReminderDue: before.nextReminderDue,
      paidAt: null,
      paidVia: null,
      markedPaidAt: null,
      markedPaidBy: null,
      beforePaid: null,
    });
    if (job.exists && job.get('status') === 'paid') tx.update(jobRef, { status: 'open' });
    writeQueue();
    logEventTx(tx, uid, paymentId, 'unmarked_paid', p.reminderStage);
  });
  return { ok: true };
});
