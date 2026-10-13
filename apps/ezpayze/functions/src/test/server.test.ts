import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signToken, verifyToken } from '../lib/token';
import { subscriptionFromStripe, verifyStripeSignature } from '../billing/stripeBilling';
import { shouldSend } from '../queue/sendQueue';
import { renderMorningEmail, formatTime } from '../email/morningEmail';
import { amountBucket, paymentFact } from '../analytics/onPaid';
import { fromHeader } from '../email/provider';
import { toE164 } from '../sms/provider';
import type { Payment, QueueItem } from '../shared/types';

test('pay-page tokens: valid, tampered, expired', () => {
  const secret = 's3cret';
  const t = signToken({ u: 'uid1', p: 'pay1', exp: Date.now() + 1000 }, secret);
  assert.deepEqual(verifyToken(t, secret)?.p, 'pay1');
  assert.equal(verifyToken(t, 'other'), null);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'uid2', p: 'pay1', exp: Date.now() + 1000 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`, secret), null);
  assert.equal(verifyToken(`${body}.`, secret), null);
  const old = signToken({ u: 'uid1', p: 'pay1', exp: Date.now() - 1 }, secret);
  assert.equal(verifyToken(old, secret), null);
  assert.equal(verifyToken(42, secret), null);
});

test('stripe webhook signature', () => {
  const raw = Buffer.from('{"type":"customer.subscription.updated"}');
  const now = Date.now();
  const t = Math.floor(now / 1000);
  const sig = createHmac('sha256', 'whsec').update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, 'whsec', now), true);
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, 'nope', now), false);
  assert.equal(verifyStripeSignature(raw, `t=${t - 1000},v1=${sig}`, 'whsec', now), false);
  assert.equal(verifyStripeSignature(raw, 'garbage', 'whsec', now), false);
});

test('stripe subscription mapping', () => {
  const sub = {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    current_period_end: 1800000000,
    items: { data: [{ price: { id: 'price_pro' } }, { price: { id: 'price_sms' } }] },
  };
  const s = subscriptionFromStripe(sub, 'price_sms', {});
  assert.equal(s.plan, 'pro');
  assert.equal(s.smsAddon, true);
  assert.equal(s.currentPeriodEnd, 1800000000000);
  const canceled = subscriptionFromStripe({ ...sub, status: 'canceled' }, 'price_sms', {});
  assert.equal(canceled.plan, 'free');
  assert.equal(canceled.smsAddon, false);
});

test('queue: what gets sent at send time', () => {
  const item = (state: QueueItem['state']) => ({ state }) as QueueItem;
  assert.equal(shouldSend(item('pending'), 'auto'), true);
  assert.equal(shouldSend(item('pending'), 'approve'), false);
  assert.equal(shouldSend(item('approved'), 'approve'), true);
  for (const s of ['paid', 'held', 'sent', 'skipped', 'failed'] as const) {
    assert.equal(shouldSend(item(s), 'auto'), false, s);
  }
});

test('morning email lists each item with its own Got paid button', () => {
  const items: QueueItem[] = [
    { paymentId: 'p1', stage: 0, kind: 'friendly', channel: 'email', state: 'pending', customerName: 'Jane <b>', jobTitle: 'Deck', amount: 50000, daysLate: 7 },
    { paymentId: 'p2', stage: 2, kind: 'final', channel: 'email', state: 'pending', customerName: 'Sam', jobTitle: 'Roof', amount: 120000, daysLate: 30 },
  ];
  const m = renderMorningEmail({ ownerName: 'Bob Smith', queue: { morningTime: '07:00', sendTime: '11:00', mode: 'auto' } }, items, [], {
    appUrl: 'https://ezpayze.web.app',
    today: '2026-10-13',
  });
  assert.equal(m.subject, '2 reminders going out at 11am. Anyone already paid?');
  assert.match(m.html, /today\?paid=p1/);
  assert.match(m.html, /today\?paid=p2/);
  assert.match(m.html, /Looks good, send them/);
  assert.match(m.html, /Jane &lt;b&gt;/);
  assert.equal(formatTime('13:30'), '1:30pm');
  assert.equal(formatTime('00:00'), '12am');
});

test('payment facts carry no PII', () => {
  const p = {
    amount: 123456, dueDate: '2026-09-01', paidAt: '2026-09-15', paidVia: 'zelle', reminderStage: 2, installment: null,
    customerName: 'Jane', customerEmail: 'jane@example.com',
  } as unknown as Payment;
  const fact = paymentFact({ industry: 'plumbing' }, p);
  assert.equal(fact.amountBucket, '1000_4999');
  assert.equal(fact.daysPastDueAtPayment, 14);
  const flat = JSON.stringify(fact);
  assert.doesNotMatch(flat, /Jane|jane@|123456/);
  assert.equal(amountBucket(9999), 'under_100');
});

test('headers and phone numbers', () => {
  assert.equal(fromHeader('Bob "The" <Plumber>\r\nBcc: x', 'billing@ezpayze.com'), '"Bob The PlumberBcc: x" <billing@ezpayze.com>');
  assert.equal(toE164('(555) 123-4567'), '+15551234567');
  assert.equal(toE164('+44 20 7946 0958'), '+442079460958');
  assert.equal(toE164('123'), null);
});
