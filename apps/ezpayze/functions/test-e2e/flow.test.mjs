// End-to-end flow against the emulators (auth, firestore, functions, storage),
// with emails captured in the emulator-only outbox. From the repo root:
//
//   npx firebase-tools emulators:exec --config firebase.ezpayze.json --project demo-ezpayze \
//     "node --test --test-force-exit apps/ezpayze/functions/test-e2e/flow.test.mjs"
//
// Walks the whole product: account + trial, jobs -> payments, the morning
// list, Got paid + Undo, Hold, Send now (and that a second Send sends nothing),
// the pay page + plan request + approval, owner-made plans, stats and facts,
// and the free-plan limits.

import { test, before, after } from 'node:test';
// Run with --test-force-exit: the Firebase client SDK keeps sockets open.
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { getFirestore as adminDb } from 'firebase-admin/firestore';

const PROJECT = 'demo-ezpayze';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` });
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const admin = adminDb(adminApp({ projectId: PROJECT }));

const call = (name, data = {}) => httpsCallable(fns, `ezpayze-${name}`)(data).then((r) => r.data);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(300);
  }
}
const nyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const addDays = (key, n) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const outbox = async () => (await admin.collection('ezpayze_config/devOutbox/emails').get()).docs.map((d) => d.data());

let uid;
const U = (...p) => ['ezpayze_users', uid, ...p].join('/');
const today = nyToday();
const job = (title, amount, dueDate, email) => ({
  customerId: title, customerName: `${title} Customer`, customerEmail: email, customerPhone: null, title,
  referenceNumber: null, category: 'Repairs', totalAmount: amount, currency: 'USD', completedDate: null, dueDate,
  attachments: [], hasPlan: false, status: 'open', createdAt: Date.now(), source: 'manual',
});
const payment = async (id) => (await getDoc(doc(db, U('payments', id)))).data();
const waitPayment = (jobId) => waitFor(async () => (await getDoc(doc(db, U('payments', `${jobId}_1`)))).data(), `payment for ${jobId}`);

before(async () => {
  const cred = await createUserWithEmailAndPassword(auth, `owner${Date.now()}@example.com`, 'password123');
  uid = cred.user.uid;
});
after(() => auth.signOut());

test('account: ensureAccount creates a profile with a Pro trial', async () => {
  const r = await call('ensureAccount', { timezone: 'America/New_York' });
  assert.equal(r.created, true);
  assert.equal((await call('ensureAccount', { timezone: 'America/New_York' })).created, false);
  const u = (await getDoc(doc(db, U()))).data();
  assert.equal(u.subscription.plan, 'pro');
  assert.equal(u.subscription.status, 'trialing');
  await assert.rejects(updateDoc(doc(db, U()), { 'subscription.status': 'active' }));
  await updateDoc(doc(db, U()), {
    ownerName: 'Bob Smith', businessName: 'Smith Plumbing', onboardingComplete: true,
    paymentMethods: [
      { type: 'venmo', label: 'Venmo', value: 'https://venmo.com/u/smith', enabled: true },
      { type: 'check', label: 'Check', value: { payableTo: 'Smith Plumbing', address: '12 Main St' }, enabled: true },
    ],
    defaultPaymentMethod: 'venmo',
    queue: { morningTime: '00:00', sendTime: '00:00', mode: 'auto' },
  });
});

test('jobs become payments on the right reminder schedule', async () => {
  await setDoc(doc(db, U('jobs', 'jobA')), job('Deck', 50000, addDays(today, -10), 'jane@example.com'));
  await setDoc(doc(db, U('jobs', 'jobB')), job('Roof', 125000, today, 'sam@example.com'));
  await setDoc(doc(db, U('jobs', 'jobC')), job('Sink', 30000, addDays(today, -40), 'lee@example.com'));
  const a = await waitPayment('jobA');
  assert.equal(a.amount, 50000);
  assert.equal(a.reminderStage, 0);
  assert.equal(a.nextReminderDue, addDays(today, -3));
  assert.equal(a.status, 'overdue');
  const b = await waitPayment('jobB');
  assert.equal(b.status, 'due');
  assert.equal(b.nextReminderDue, addDays(today, 7));
  await waitPayment('jobC');
  await assert.rejects(updateDoc(doc(db, U('payments', 'jobA_1')), { status: 'paid' }));
});

test("today's list holds what is due, oldest first", async () => {
  const r = await call('refreshToday');
  assert.equal(r.built, true);
  const day = (await getDoc(doc(db, U('queue', today)))).data();
  assert.deepEqual(day.items.map((i) => i.paymentId), ['jobC_1', 'jobA_1']);
  assert.equal(day.items[0].kind, 'friendly');
  assert.equal(day.items[0].daysLate, 40);
});

test('Got paid takes it off the list; Undo puts it back', async () => {
  await call('markPaid', { paymentId: 'jobC_1', paidVia: 'check' });
  let p = await payment('jobC_1');
  assert.equal(p.status, 'paid');
  assert.equal(p.nextReminderDue, null);
  assert.equal((await getDoc(doc(db, U('jobs', 'jobC')))).data().status, 'paid');
  let day = (await getDoc(doc(db, U('queue', today)))).data();
  assert.equal(day.items.find((i) => i.paymentId === 'jobC_1').state, 'paid');

  await call('undoMarkPaid', { paymentId: 'jobC_1' });
  p = await payment('jobC_1');
  assert.equal(p.status, 'overdue');
  assert.equal(p.nextReminderDue, addDays(today, -33));
  day = (await getDoc(doc(db, U('queue', today)))).data();
  assert.equal(day.items.find((i) => i.paymentId === 'jobC_1').state, 'pending');
  assert.equal((await getDoc(doc(db, U('jobs', 'jobC')))).data().status, 'open');

  await call('markPaid', { paymentId: 'jobC_1', paidVia: 'check', paidAt: addDays(today, -1) });
  assert.equal((await payment('jobC_1')).paidAt, addDays(today, -1));
});

test('Hold skips today; Undo restores', async () => {
  await call('queueAction', { action: 'hold', paymentId: 'jobA_1' });
  assert.equal((await payment('jobA_1')).nextReminderDue, addDays(today, 1));
  await call('queueAction', { action: 'unhold', paymentId: 'jobA_1' });
  assert.equal((await payment('jobA_1')).nextReminderDue, today);
});

test('Send now sends once, never to someone marked paid, and never twice', async () => {
  const before = (await outbox()).length;
  const r = await call('sendNow');
  assert.equal(r.sent, 1);
  assert.equal(r.failed, 0);
  const mail = (await outbox()).slice(before);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'jane@example.com');
  assert.equal(mail[0].fromName, 'Smith Plumbing via EzPayze');
  assert.match(mail[0].subject, /friendly reminder from Smith Plumbing/);
  assert.match(mail[0].html, /Pay with Venmo/);
  assert.match(mail[0].html, /Mail to: 12 Main St/);
  const a = await payment('jobA_1');
  assert.equal(a.reminderStage, 1);
  assert.equal(a.nextReminderDue, addDays(today, 4)); // day 14 after due
  const again = await call('sendNow');
  assert.equal(again.sent, 0);
  assert.equal((await outbox()).length, before + 1);
  const day = (await getDoc(doc(db, U('queue', today)))).data();
  assert.equal(day.items.find((i) => i.paymentId === 'jobA_1').state, 'sent');
  assert.equal(day.items.find((i) => i.paymentId === 'jobC_1').state, 'paid');
});

test('pay page: token shows the bill; customer asks for a plan; owner approves', async () => {
  const mail = (await outbox()).find((m) => m.to === 'jane@example.com');
  const token = /\/pay\/([\w.-]+)/.exec(mail.text)[1];
  const page = await call('payPage', { token });
  assert.equal(page.businessName, 'Smith Plumbing');
  assert.equal(page.amount, 50000);
  assert.equal(page.methods[0].type, 'venmo');
  assert.deepEqual(page.planOptions, [2, 3, 4, 6]);
  assert.equal(page.customerEmail, undefined);
  await assert.rejects(call('payPage', { token: `${token}x` }));

  await call('requestPlan', { token, count: 2, note: 'Tight month' });
  await assert.rejects(call('requestPlan', { token, count: 2, note: '' }));
  const req = (await getDoc(doc(db, U('planRequests', 'jobA_1')))).data();
  assert.equal(req.status, 'pending');

  const r = await call('respondPlanRequest', { requestId: 'jobA_1', action: 'approve' });
  assert.match(r.description, /^2 payments of \$250, due /);
  assert.equal((await payment('jobA_1')).status, 'canceled');
  const all = (await admin.collection(U('payments')).where('jobId', '==', 'jobA').get()).docs.map((d) => d.data());
  const inst = all.filter((p) => p.installment).sort((x, y) => x.installment.number - y.installment.number);
  assert.equal(inst.length, 2);
  assert.equal(inst[0].amount + inst[1].amount, 50000);
  assert.ok(inst.every((p) => p.dueDate.endsWith('-01')));
  const confirm = (await outbox()).find((m) => m.subject.startsWith('Your payment plan'));
  assert.ok(confirm, 'customer got a confirmation');
  assert.equal(confirm.to, 'jane@example.com');
});

test('owner splits a job with an uneven remainder', async () => {
  await setDoc(doc(db, U('jobs', 'jobD')), job('Fence', 100001, today, 'kim@example.com'));
  await waitPayment('jobD');
  const r = await call('createPlan', { jobId: 'jobD', count: 3, frequency: 'biweekly', startDate: addDays(today, 7) });
  assert.deepEqual(r.rows.map((x) => x.amount), [33333, 33333, 33335]);
  assert.deepEqual(r.rows.map((x) => x.dueDate), [addDays(today, 7), addDays(today, 21), addDays(today, 35)]);
  assert.equal((await getDoc(doc(db, U('jobs', 'jobD')))).data().hasPlan, true);
});

test('stats and anonymized facts update when something is paid', async () => {
  const s = await waitFor(async () => {
    const d = (await getDoc(doc(db, U('stats', 'summary')))).data();
    return d && d.paidLast30Count >= 1 ? d : null;
  }, 'stats summary');
  assert.equal(s.paidLast30Amount, 30000);
  assert.equal(s.byMethod.check.paidCount, 1);
  const facts = await waitFor(async () => {
    const q = await admin.collection('ezpayze_paymentFacts').get();
    return q.size ? q.docs.map((d) => d.data()) : null;
  }, 'payment fact');
  const flat = JSON.stringify(facts);
  assert.doesNotMatch(flat, /Customer|example\.com|30000|Smith/);
  assert.equal(facts[0].method, 'check');
});

test('free plan: 3 open jobs, then reminders stay off; plans need Pro', async () => {
  await admin.doc(U()).update({ subscription: { plan: 'free', status: 'active', smsAddon: false, stripeCustomerId: null, trialEndsAt: null, currentPeriodEnd: null } });
  // Open now: jobA, jobB, jobD. The next one is over the limit.
  await setDoc(doc(db, U('jobs', 'jobE')), job('Gutter', 20000, today, 'pat@example.com'));
  const e = await waitPayment('jobE');
  assert.equal(e.paused, true);
  assert.equal((await getDoc(doc(db, U('jobs', 'jobE')))).data().limitBlocked, true);
  await assert.rejects(call('editPayment', { paymentId: 'jobE_1', paused: false }), /Free accounts/);
  await assert.rejects(call('createPlan', { jobId: 'jobB', count: 2, frequency: 'monthly_first' }), /Pro/);
});
