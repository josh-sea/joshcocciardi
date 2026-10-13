// The public pay page and "Can I split this up?" requests.
//
// The customer never logs in. Their link carries a signed, expiring token that
// names one payment; these callables check it and return only what the page
// needs (business name, job, amount, ways to pay, split options).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { isPro } from '../shared/billing';
import { longDate, todayKey } from '../shared/dates';
import { methodsToShow } from '../shared/methods';
import { formatMoney } from '../shared/money';
import { describePlan, suggestedCounts } from '../shared/plan';
import { escapeHtml } from '../shared/templates';
import type { Payment, PlanRequest } from '../shared/types';
import { appSettings, paypageSecret } from '../lib/config';
import { logEventTx } from '../lib/events';
import { db, paymentsCol, planRequestsCol } from '../lib/firebase';
import { verifyToken } from '../lib/token';
import { loadUser, requireUser, str } from '../lib/users';
import { isEmail, sendEmail } from '../email/provider';
import { applyPlan, parseSpec } from './createPlan';

async function resolve(token: unknown) {
  const payload = verifyToken(token, await paypageSecret());
  if (!payload) throw new HttpsError('permission-denied', 'This link has expired. Please reply to the email you got and ask for a new one.');
  const [user, snap] = await Promise.all([loadUser(payload.u), paymentsCol(payload.u).doc(payload.p).get()]);
  if (!user || !snap.exists) throw new HttpsError('not-found', 'We could not find this bill.');
  return { uid: payload.u, paymentId: payload.p, user, payment: snap.data() as Payment };
}

export const payPage = onCall({ cors: true }, async (req) => {
  const { uid, paymentId, user, payment } = await resolve(req.data?.token);
  const request = await planRequestsCol(uid).doc(paymentId).get();
  const open = payment.status !== 'paid' && payment.status !== 'canceled';
  const canAsk =
    open && !payment.installment && isPro(user.subscription) && user.offerPaymentPlans && !request.exists;
  return {
    businessName: user.businessName,
    ownerName: user.ownerName,
    logoUrl: user.logoUrl,
    replyToEmail: user.replyToEmail,
    phone: user.phone,
    customerName: payment.customerName,
    jobTitle: payment.jobTitle,
    referenceNumber: payment.referenceNumber,
    amount: payment.amount,
    dueDate: payment.dueDate,
    installment: payment.installment,
    status: payment.status === 'paid' ? 'paid' : payment.status === 'canceled' ? 'canceled' : 'open',
    methods: methodsToShow(user.paymentMethods, {
      defaultType: user.defaultPaymentMethod,
      overrideType: payment.paymentMethodType,
      showAll: true,
    }),
    planOptions: canAsk ? suggestedCounts(payment.amount) : [],
    planRequest: request.exists ? { status: request.get('status'), count: request.get('count') } : null,
    today: todayKey(user.timezone),
  };
});

export const requestPlan = onCall({ cors: true }, async (req) => {
  const { uid, paymentId, user, payment } = await resolve(req.data?.token);
  const count = Number(req.data?.count);
  const note = str(req.data?.note, 500);
  if (!isPro(user.subscription) || !user.offerPaymentPlans || payment.installment) {
    throw new HttpsError('failed-precondition', 'Please reply to the email to talk about a payment plan.');
  }
  if (!suggestedCounts(payment.amount).includes(count)) throw new HttpsError('invalid-argument', 'Pick one of the options.');
  const ref = planRequestsCol(uid).doc(paymentId);
  await db.runTransaction(async (tx) => {
    const [existing, p] = await Promise.all([tx.get(ref), tx.get(paymentsCol(uid).doc(paymentId))]);
    if (existing.exists) throw new HttpsError('already-exists', 'You already asked. They will get back to you soon.');
    if (['paid', 'canceled'].includes(p.get('status'))) throw new HttpsError('failed-precondition', 'This bill is already settled.');
    const request: PlanRequest = {
      paymentId,
      jobId: payment.jobId,
      customerName: payment.customerName,
      jobTitle: payment.jobTitle,
      amount: payment.amount,
      count,
      note,
      status: 'pending',
      createdAt: Date.now(),
    };
    tx.set(ref, request);
    logEventTx(tx, uid, paymentId, 'plan_requested', payment.reminderStage, { count });
  });

  // Let the owner know right away (best effort; it is also on Today).
  try {
    const settings = await appSettings();
    const line = `${payment.customerName} asked to pay ${formatMoney(payment.amount)} for ${payment.jobTitle} in ${count} payments.`;
    await sendEmail({
      to: user.email,
      fromName: 'EzPayze',
      fromEmail: settings.fromEmail,
      subject: `${payment.customerName} asked for a payment plan`,
      text: `${line}${note ? `\n\nTheir note: "${note}"` : ''}\n\nApprove, change, or decline it here: ${settings.appUrl}/today`,
      html:
        `<div style="font-family:Arial,sans-serif;font-size:20px;color:#111">` +
        `<p>${escapeHtml(line)}</p>${note ? `<p>Their note: "${escapeHtml(note)}"</p>` : ''}` +
        `<p><a href="${settings.appUrl}/today" style="display:inline-block;background:#0b3d91;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700">Look at it</a></p></div>`,
    });
  } catch (err) {
    logger.warn('plan request notice not sent', { uid, err: (err as Error).message });
  }
  return { ok: true };
});

export const respondPlanRequest = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const requestId = str(req.data?.requestId, 100);
  const action = str(req.data?.action, 20);
  if (!['approve', 'decline'].includes(action)) throw new HttpsError('invalid-argument', 'Approve or decline?');
  const ref = planRequestsCol(uid).doc(requestId);
  const today = todayKey(user.timezone);

  if (action === 'decline') {
    await ref.update({ status: 'declined', respondedAt: Date.now() });
    return { ok: true };
  }
  if (!isPro(user.subscription)) throw new HttpsError('permission-denied', 'Payment plans are part of EzPayze Pro.');

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That request is gone.');
    const r = snap.data() as PlanRequest;
    if (r.status !== 'pending') throw new HttpsError('failed-precondition', 'You already answered this one.');
    const spec = parseSpec({ frequency: 'monthly_first', count: r.count, startDate: today, ...(req.data?.plan ?? {}) }, today);
    const plan = await applyPlan(tx, uid, user, r.jobId, spec, today, { by: 'customer_request' });
    tx.update(ref, { status: 'approved', respondedAt: Date.now(), count: spec.count });
    return { request: r, ...plan };
  });

  // Confirm the schedule with the customer.
  const email = result.job.customerEmail;
  if (isEmail(email)) {
    try {
      const settings = await appSettings();
      const lines = result.rows.map((row) => `Payment ${row.number} of ${row.of}: ${formatMoney(row.amount)} due ${longDate(row.dueDate)}`);
      const intro = `Good news. ${user.businessName} said yes to your payment plan for ${result.request.jobTitle}.`;
      await sendEmail({
        to: email,
        fromName: `${user.businessName} via EzPayze`,
        fromEmail: settings.fromEmail,
        replyTo: user.replyToEmail,
        subject: `Your payment plan with ${user.businessName}`,
        text: `${intro}\n\n${describePlan(result.rows, today)}.\n\n${lines.join('\n')}\n\nWe will send a short reminder a few days before each one. Questions? Just reply to this email.`,
        html:
          `<div style="font-family:Arial,sans-serif;font-size:20px;color:#111;max-width:600px">` +
          `<p>${escapeHtml(intro)}</p><p><strong>${escapeHtml(describePlan(result.rows, today))}.</strong></p>` +
          `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` +
          `<p>We will send a short reminder a few days before each one. Questions? Just reply to this email.</p></div>`,
      });
    } catch (err) {
      logger.warn('plan confirmation not sent', { uid, err: (err as Error).message });
    }
  }
  return { ok: true, description: result.description };
});
