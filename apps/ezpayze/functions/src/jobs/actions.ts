// Edits that touch payments. Clients may not write payments directly (their
// reminder fields drive what gets sent), so every change goes through here.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isDateKey, todayKey } from '../shared/dates';
import { nextReminderDate, openStatus } from '../shared/schedule';
import type { Job, Payment } from '../shared/types';
import { logEventTx } from '../lib/events';
import { db, jobsCol, paymentsCol } from '../lib/firebase';
import { requireUser, str } from '../lib/users';
import { isEmail } from '../email/provider';

const OPEN = (s: string) => s !== 'paid' && s !== 'canceled';

/** Change job details; open payments pick up the new customer contact info. */
export const updateJob = onCall({ cors: true }, async (req) => {
  const { uid } = await requireUser(req);
  const jobId = str(req.data?.jobId, 100);
  const ref = jobsCol(uid).doc(jobId);
  const d = req.data ?? {};
  const jobUpdate: Partial<Job> = {};
  const payUpdate: Partial<Payment> = {};
  if (typeof d.title === 'string' && str(d.title)) jobUpdate.title = payUpdate.jobTitle = str(d.title, 120);
  if ('referenceNumber' in d) jobUpdate.referenceNumber = payUpdate.referenceNumber = str(d.referenceNumber, 60) || null;
  if ('category' in d) jobUpdate.category = payUpdate.category = str(d.category, 60) || null;
  if ('customerEmail' in d) {
    const e = str(d.customerEmail, 254).toLowerCase();
    if (e && !isEmail(e)) throw new HttpsError('invalid-argument', 'That email address does not look right.');
    jobUpdate.customerEmail = payUpdate.customerEmail = e || null;
  }
  if ('customerPhone' in d) jobUpdate.customerPhone = payUpdate.customerPhone = str(d.customerPhone, 30) || null;
  if ('customerName' in d && str(d.customerName)) jobUpdate.customerName = payUpdate.customerName = str(d.customerName, 120);

  await db.runTransaction(async (tx) => {
    const job = await tx.get(ref);
    if (!job.exists) throw new HttpsError('not-found', 'That job is gone.');
    const pays = await tx.get(paymentsCol(uid).where('jobId', '==', jobId));
    tx.update(ref, jobUpdate);
    for (const p of pays.docs) {
      if (!OPEN(p.get('status'))) continue;
      tx.update(p.ref, payUpdate);
      logEventTx(tx, uid, p.id, 'edited', null, { fields: Object.keys(payUpdate) });
    }
  });
  return { ok: true };
});

export const cancelJob = onCall({ cors: true }, async (req) => {
  const { uid } = await requireUser(req);
  const jobId = str(req.data?.jobId, 100);
  const ref = jobsCol(uid).doc(jobId);
  await db.runTransaction(async (tx) => {
    const job = await tx.get(ref);
    if (!job.exists) throw new HttpsError('not-found', 'That job is gone.');
    const pays = await tx.get(paymentsCol(uid).where('jobId', '==', jobId));
    tx.update(ref, { status: 'canceled' });
    for (const p of pays.docs) {
      if (!OPEN(p.get('status'))) continue;
      tx.update(p.ref, { status: 'canceled', nextReminderDue: null });
      logEventTx(tx, uid, p.id, 'canceled');
    }
  });
  return { ok: true };
});

/** Pause or resume reminders, or change one payment's amount or due date. */
export const editPayment = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const paymentId = str(req.data?.paymentId, 100);
  const d = req.data ?? {};
  const today = todayKey(user.timezone);
  const ref = paymentsCol(uid).doc(paymentId);
  const ladderOpts = { reminderSchedule: user.reminderSchedule, courtesyNote: user.courtesyNote };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That payment is gone.');
    const p = snap.data() as Payment;
    if (!OPEN(p.status)) throw new HttpsError('failed-precondition', 'That payment is already settled.');
    const jobRef = jobsCol(uid).doc(p.jobId);
    const job = await tx.get(jobRef);
    const next: Partial<Payment> = {};
    if (typeof d.paused === 'boolean') {
      if (!d.paused && job.get('limitBlocked')) {
        throw new HttpsError('failed-precondition', 'Free accounts can send reminders for 3 jobs at a time. Upgrade to Pro to turn this one on.');
      }
      next.paused = d.paused;
    }
    if (d.amount !== undefined) {
      const amount = Number(d.amount);
      if (!Number.isInteger(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Enter an amount.');
      next.amount = amount;
    }
    if (d.dueDate !== undefined) {
      if (!isDateKey(d.dueDate)) throw new HttpsError('invalid-argument', 'Pick a due date.');
      next.dueDate = d.dueDate;
      next.status = openStatus(d.dueDate, today);
    }
    if ('paymentMethodType' in d) next.paymentMethodType = str(d.paymentMethodType, 40) || null;
    if (next.dueDate) {
      const merged = { ...p, ...next };
      let due = nextReminderDate(merged, ladderOpts);
      if (due && due < today && p.lastReminderSent) due = today;
      next.nextReminderDue = due;
    }
    tx.update(ref, next);
    if (next.amount !== undefined && !p.installment && job.exists) tx.update(jobRef, { totalAmount: next.amount });
    logEventTx(tx, uid, paymentId, 'edited', null, { fields: Object.keys(next) });
  });
  return { ok: true };
});
