import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, daysBetween, isDateKey, lateLabel, localParts, passedLocalTime, timeToMinutes } from '../shared/dates';
import { buildLadder, cleanSchedule, describeSchedule, initialStage, nextAfterSend, nextStep, openStatus } from '../shared/schedule';
import { buildPlan, describePlan, planDates, splitAmount, suggestedCounts } from '../shared/plan';
import { formatMoney, parseMoney } from '../shared/money';
import { methodsToShow, normalizeMethodValue } from '../shared/methods';
import { fill, renderReminder, samplePayment } from '../shared/templates';
import { computeStats } from '../shared/stats';
import { isPro, hasSms } from '../shared/billing';
import type { Payment, PaymentMethod } from '../shared/types';

test('dates: local parts across time zones', () => {
  // 2026-03-10T13:30Z: 9:30am in New York (EDT), 6:30am in Los Angeles,
  // and already the 11th in Auckland.
  const t = Date.UTC(2026, 2, 10, 13, 30);
  assert.deepEqual(localParts(t, 'America/New_York'), { dateKey: '2026-03-10', minutes: 9 * 60 + 30 });
  assert.deepEqual(localParts(t, 'America/Los_Angeles'), { dateKey: '2026-03-10', minutes: 6 * 60 + 30 });
  assert.equal(localParts(t, 'Pacific/Auckland').dateKey, '2026-03-11');
  // Midnight renders as 0, not 24.
  assert.equal(localParts(Date.UTC(2026, 0, 1, 5, 0), 'America/New_York').minutes, 0);
  // Bad zone falls back instead of throwing.
  assert.ok(isDateKey(localParts(t, 'Not/AZone').dateKey));
});

test('queue timing follows each owner\'s own clock', () => {
  // 11:05 UTC = 7:05am New York (EDT), 4:05am Los Angeles.
  const t = Date.UTC(2026, 9, 13, 11, 5);
  assert.equal(passedLocalTime(t, 'America/New_York', '07:00'), '2026-10-13');
  assert.equal(passedLocalTime(t, 'America/Los_Angeles', '07:00'), null);
  assert.equal(passedLocalTime(t, 'America/New_York', '11:00'), null);
  // 3 hours later LA's morning list is due too.
  assert.equal(passedLocalTime(t + 3 * 3600000, 'America/Los_Angeles', '07:00'), '2026-10-13');
  // Late-evening UTC is still "yesterday" out west.
  assert.equal(passedLocalTime(Date.UTC(2026, 9, 14, 2, 0), 'America/Los_Angeles', '07:00'), '2026-10-13');
});

test('dates: arithmetic', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2027-11-15', 3, 30), '2028-02-29');
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(timeToMinutes('11:00'), 660);
  assert.equal(timeToMinutes('nope'), 420);
  assert.equal(lateLabel('2026-10-01', '2026-10-13'), '12 days late');
  assert.equal(lateLabel('2026-10-13', '2026-10-13'), 'Due today');
});

test('schedule: default ladder 7/14/30 with tones', () => {
  assert.deepEqual(buildLadder({}, false), [
    { offsetDays: 7, kind: 'friendly' },
    { offsetDays: 14, kind: 'firm' },
    { offsetDays: 30, kind: 'final' },
  ]);
  assert.equal(buildLadder({ courtesyNote: true }, false)[0].kind, 'courtesy');
  assert.deepEqual(buildLadder({}, true)[0], { offsetDays: -3, kind: 'courtesy' });
  assert.deepEqual(cleanSchedule([30, 7, 7, 'x', 0]), [7, 30]);
  assert.equal(describeSchedule([7, 14, 30]), '7, 14, and 30 days late');
});

test('schedule: next step and catch-up spacing', () => {
  const p = { dueDate: '2026-10-01', reminderStage: 0, installment: null };
  assert.equal(nextStep(p, {})?.date, '2026-10-08');
  assert.equal(nextStep({ ...p, reminderStage: 3 }, {}), null);
  // Normal pace: after reminder 1 on day 7, reminder 2 lands on day 14.
  assert.equal(nextAfterSend(p, {}, '2026-10-08'), '2026-10-15');
  // Job added 40 days late: the next reminder is spaced out, not tomorrow.
  const late = { dueDate: '2026-09-01', reminderStage: 0, installment: null };
  assert.equal(nextAfterSend(late, {}, '2026-10-11'), '2026-10-14');
  // Last step done -> out of the scan.
  assert.equal(nextAfterSend({ ...p, reminderStage: 2 }, {}, '2026-10-31'), null);
  // A stale heads-up is skipped.
  assert.equal(initialStage({ dueDate: '2026-10-01', installment: { number: 1, of: 2 } }, {}, '2026-10-13'), 1);
  assert.equal(initialStage({ dueDate: '2026-11-01', installment: { number: 1, of: 2 } }, {}, '2026-10-13'), 0);
  assert.equal(openStatus('2026-10-12', '2026-10-13'), 'overdue');
});

test('plans: split with remainder on the last payment', () => {
  assert.deepEqual(splitAmount(100000, 4), [25000, 25000, 25000, 25000]);
  assert.deepEqual(splitAmount(100001, 3), [33333, 33333, 33335]);
  const total = splitAmount(99999, 7).reduce((a, b) => a + b, 0);
  assert.equal(total, 99999);
});

test('plans: dates by frequency', () => {
  assert.deepEqual(planDates({ count: 4, frequency: 'monthly_first', startDate: '2026-10-13' }), [
    '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01',
  ]);
  assert.deepEqual(planDates({ count: 3, frequency: 'monthly_day', startDate: '2027-01-31', dayOfMonth: 31 }), [
    '2027-01-31', '2027-02-28', '2027-03-31',
  ]);
  assert.deepEqual(planDates({ count: 3, frequency: 'biweekly', startDate: '2026-10-15' }), [
    '2026-10-15', '2026-10-29', '2026-11-12',
  ]);
  const plan = buildPlan(100000, { count: 4, frequency: 'monthly_first', startDate: '2026-10-13' });
  assert.ok('rows' in plan);
  if ('rows' in plan) {
    assert.equal(describePlan(plan.rows), '4 payments of $250, due Nov 1, 2026, Dec 1, 2026, Jan 1, 2027, Feb 1, 2027');
  }
  const same = buildPlan(100000, { count: 2, frequency: 'monthly_first', startDate: '2026-10-13' });
  if ('rows' in same) assert.equal(describePlan(same.rows), '2 payments of $500, due Nov 1, Dec 1');
  assert.ok('error' in buildPlan(100000, { count: 13, frequency: 'monthly_first', startDate: '2026-10-13' }));
  assert.ok('error' in buildPlan(100000, { count: 2, frequency: 'custom', startDate: '2026-10-13', customDates: ['2026-11-01'] }));
  assert.deepEqual(suggestedCounts(25000), [2, 3, 4, 6]);
  assert.deepEqual(suggestedCounts(250), [2]);
});

test('money', () => {
  assert.equal(formatMoney(125000), '$1,250');
  assert.equal(formatMoney(125050), '$1,250.50');
  assert.equal(parseMoney('$1,250.5'), 125050);
  assert.equal(parseMoney('12.345'), null);
  assert.equal(parseMoney('abc'), null);
});

test('methods: normalize what owners type', () => {
  assert.deepEqual(normalizeMethodValue('venmo', '@Smith-Plumbing'), { value: 'https://venmo.com/u/Smith-Plumbing' });
  assert.deepEqual(normalizeMethodValue('cashapp', '$Smith'), { value: 'https://cash.app/$Smith' });
  assert.deepEqual(normalizeMethodValue('paypal', 'paypal.me/Smith'), { value: 'https://paypal.me/Smith' });
  assert.ok('error' in normalizeMethodValue('stripe', 'javascript:alert(1)'));
  assert.ok('error' in normalizeMethodValue('check', { payableTo: 'X', address: '' }));
  const methods: PaymentMethod[] = [
    { type: 'check', label: 'Check', value: { payableTo: 'A', address: 'B' } },
    { type: 'venmo', label: 'Venmo', value: 'https://venmo.com/u/a' },
    { type: 'cash', label: 'Cash', value: 'x', enabled: false },
  ];
  assert.deepEqual(methodsToShow(methods, { defaultType: 'venmo' }).map((m) => m.type), ['venmo', 'check']);
  assert.deepEqual(methodsToShow(methods, { defaultType: 'venmo', overrideType: 'check' }).map((m) => m.type), ['check']);
});

test('templates: render escapes and includes everything', () => {
  const user = {
    businessName: 'Bob & Sons <Plumbing>',
    ownerName: 'Bob',
    replyToEmail: 'bob@example.com',
    logoUrl: null,
    paymentMethods: [{ type: 'venmo' as const, label: 'Venmo', value: 'https://venmo.com/u/bob' }],
    defaultPaymentMethod: 'venmo',
    showAllMethods: true,
    wording: { friendly: { subject: 'Custom {amount}', body: 'Custom body {customer}' } },
    offerPaymentPlans: true,
  };
  const r = renderReminder(user, samplePayment('2026-10-06'), {
    kind: 'final',
    today: '2026-11-05',
    allowCustomWording: true,
    payPageUrl: 'https://ezpayze.web.app/pay/t',
    planOfferUrl: 'https://ezpayze.web.app/pay/t?plan=1',
  });
  assert.match(r.subject, /Final notice: \$1,250 for Kitchen cabinet install/);
  assert.match(r.text, /30 days past due/);
  assert.match(r.html, /Bob &amp; Sons &lt;Plumbing&gt;/);
  assert.doesNotMatch(r.html, /<Plumbing>/);
  assert.match(r.html, /Pay with Venmo/);
  assert.match(r.html, /ask for a payment plan/);
  assert.match(r.sms, /Reply STOP/);
  // Custom wording only applies when allowed.
  const custom = renderReminder(user, samplePayment('2026-10-06'), { kind: 'friendly', today: '2026-10-13', allowCustomWording: true });
  assert.equal(custom.subject, 'Custom $1,250');
  const plain = renderReminder(user, samplePayment('2026-10-06'), { kind: 'friendly', today: '2026-10-13', allowCustomWording: false });
  assert.equal(plain.subject, 'A friendly reminder from Bob & Sons <Plumbing>');
  assert.equal(fill('{a} {b}', { a: '1' }), '1 {b}');
});

function pay(over: Partial<Payment>): Payment {
  return {
    userId: 'u', jobId: 'j', customerId: 'c1', customerName: 'Jane', customerEmail: null, customerPhone: null,
    jobTitle: 'Job', referenceNumber: null, category: null, amount: 10000, dueDate: '2026-09-01', installment: null,
    paymentMethodType: null, status: 'paid', reminderStage: 1, lastReminderSent: null, nextReminderDue: null,
    paused: false, paidAt: '2026-09-05', paidVia: 'venmo', markedPaidAt: 1, markedPaidBy: 'owner', createdAt: 1,
    ...over,
  };
}

test('stats and insight', () => {
  const payments = [
    pay({ paidVia: 'venmo', paidAt: '2026-09-02' }),
    pay({ paidVia: 'venmo', paidAt: '2026-09-03' }),
    pay({ paidVia: 'venmo', paidAt: '2026-09-04' }),
    pay({ paidVia: 'check', paidAt: '2026-09-10' }),
    pay({ paidVia: 'check', paidAt: '2026-09-11' }),
    pay({ paidVia: 'check', paidAt: '2026-09-12' }),
    pay({ status: 'overdue', paidAt: null, paidVia: null, dueDate: '2026-10-01', amount: 5000 }),
    pay({ status: 'canceled', paidAt: null }),
  ];
  const s = computeStats(payments, { today: '2026-10-13' });
  assert.equal(s.openCount, 1);
  assert.equal(s.overdueAmount, 5000);
  assert.equal(s.paidCount, 6);
  assert.equal(s.byMethod.venmo.avgDaysToPay, 2);
  assert.equal(s.insight, 'Customers who pay by Venmo pay you 8 days faster than Check.');
  const ranged = computeStats(payments, { today: '2026-10-13', from: '2026-09-10' });
  assert.equal(ranged.paidCount, 3);
});

test('billing: plan checks', () => {
  const now = Date.UTC(2026, 9, 13);
  assert.equal(isPro({ plan: 'pro', status: 'trialing', trialEndsAt: now + 1 }, now), true);
  assert.equal(isPro({ plan: 'pro', status: 'trialing', trialEndsAt: now - 1 }, now), false);
  assert.equal(isPro({ plan: 'free', status: 'active' }, now), false);
  assert.equal(hasSms({ plan: 'pro', status: 'active', smsAddon: true }, now), true);
  assert.equal(hasSms({ plan: 'pro', status: 'trialing', smsAddon: true, trialEndsAt: now + 1 }, now), false);
});
