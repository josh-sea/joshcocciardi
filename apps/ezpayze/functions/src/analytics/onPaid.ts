// Payment facts and the owner's summary.
//
// When a payment flips to paid we write one anonymized fact to
// ezpayze_paymentFacts (no names, emails, exact amounts, or owner id; only
// buckets) for platform-wide learning, and refresh the owner's stats/summary.
// Undo removes the fact again.

import { createHash } from 'node:crypto';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { daysBetween, todayKey } from '../shared/dates';
import { computeStats } from '../shared/stats';
import type { EzUser, Payment } from '../shared/types';
import { COL, db, paymentsCol, statsRef } from '../lib/firebase';
import { loadUser } from '../lib/users';

export function amountBucket(cents: number): string {
  const d = cents / 100;
  if (d < 100) return 'under_100';
  if (d < 500) return '100_499';
  if (d < 1000) return '500_999';
  if (d < 5000) return '1000_4999';
  return '5000_plus';
}

export function factId(uid: string, paymentId: string): string {
  return createHash('sha256').update(`ezpayze:${uid}:${paymentId}`).digest('hex').slice(0, 32);
}

export function paymentFact(user: Pick<EzUser, 'industry'>, p: Payment) {
  const paidAt = p.paidAt ?? p.dueDate;
  return {
    userIndustry: user.industry ?? null,
    amountBucket: amountBucket(p.amount),
    method: p.paidVia ?? 'unknown',
    daysPastDueAtPayment: daysBetween(p.dueDate, paidAt),
    remindersBeforePayment: p.reminderStage,
    wasPlan: !!p.installment,
    paidAtDayOfWeek: new Date(`${paidAt}T12:00:00Z`).getUTCDay(),
    paidMonth: paidAt.slice(0, 7),
  };
}

export async function recomputeSummary(uid: string, user: EzUser) {
  const today = todayKey(user.timezone);
  const snap = await paymentsCol(uid).get();
  const payments = snap.docs.map((d) => d.data() as Payment);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const all = computeStats(payments, { today });
  const last30 = computeStats(payments, { today, from });
  await statsRef(uid).set({
    openCount: all.openCount,
    openAmount: all.openAmount,
    overdueCount: all.overdueCount,
    overdueAmount: all.overdueAmount,
    paidLast30Count: last30.paidCount,
    paidLast30Amount: last30.paidAmount,
    avgDaysToPay: all.avgDaysToPay,
    medianDaysToPay: all.medianDaysToPay,
    byMethod: all.byMethod,
    byStageAtPayment: all.byStageAtPayment,
    byCustomer: all.byCustomer,
    byCategory: all.byCategory,
    insight: all.insight,
    updatedAt: Date.now(),
  });
}

export const onPaymentPaid = onDocumentWritten(
  { document: 'ezpayze_users/{uid}/payments/{paymentId}' },
  async (event) => {
    const { uid, paymentId } = event.params;
    const before = event.data?.before?.data() as Payment | undefined;
    const after = event.data?.after?.data() as Payment | undefined;
    const statusChanged = before?.status !== after?.status;
    const amountChanged = before?.amount !== after?.amount || before?.dueDate !== after?.dueDate;
    if (!statusChanged && !amountChanged) return;

    const user = await loadUser(uid);
    if (!user) return;
    const ref = db.collection(COL.facts).doc(factId(uid, paymentId));
    if (after?.status === 'paid' && before?.status !== 'paid') await ref.set(paymentFact(user, after));
    if (before?.status === 'paid' && after?.status !== 'paid') await ref.delete();
    await recomputeSummary(uid, user);
  },
);
