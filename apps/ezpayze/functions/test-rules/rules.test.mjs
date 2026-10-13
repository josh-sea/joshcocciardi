// EzPayze security rules against the emulators. From the repo root:
//
//   npx firebase-tools emulators:exec --only firestore,storage --project demo-ezpayze \
//     "npm --prefix apps/ezpayze/functions run test:rules"
//
// Covers: cross-user access is denied, clients can't write protected fields
// (subscription, payments, queue, stats, events, facts, config), job creates
// are shape-checked, and Storage is owner-only, PDF/image, under 10 MB.

import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, setLogLevel } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const root = new URL('../../../../', import.meta.url);
let env;

before(async () => {
  setLogLevel('error');
  env = await initializeTestEnvironment({
    projectId: 'demo-ezpayze',
    firestore: { rules: readFileSync(new URL('firestore.rules', root), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(new URL('storage.rules', root), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'ezpayze_users/alice'), {
      email: 'a@example.com', businessName: 'A', subscription: { plan: 'pro', status: 'trialing' }, createdAt: 1,
    });
    await setDoc(doc(db, 'ezpayze_users/alice/payments/p1'), { status: 'overdue', amount: 100 });
    await setDoc(doc(db, 'ezpayze_users/alice/jobs/j1'), { status: 'open', attachments: [], title: 'Deck' });
    await setDoc(doc(db, 'ezpayze_users/alice/queue/2026-10-13'), { items: [], sentAt: null });
    await setDoc(doc(db, 'ezpayze_paymentFacts/f1'), { method: 'venmo' });
    await setDoc(doc(db, 'ezpayze_config/secrets'), { resendApiKey: 'x' });
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();

const goodJob = {
  customerId: 'c1', customerName: 'Jane', customerEmail: 'jane@example.com', customerPhone: null,
  title: 'Kitchen', referenceNumber: null, category: null, totalAmount: 125000, currency: 'USD',
  completedDate: null, dueDate: '2026-10-13', attachments: [], hasPlan: false, status: 'open',
  createdAt: 1, source: 'manual',
};

test('owner reads own tree; others cannot', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'ezpayze_users/alice')));
  await assertSucceeds(getDoc(doc(alice(), 'ezpayze_users/alice/payments/p1')));
  await assertFails(getDoc(doc(bob(), 'ezpayze_users/alice')));
  await assertFails(getDoc(doc(bob(), 'ezpayze_users/alice/payments/p1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'ezpayze_users/alice')));
});

test('the catch-all does not open EzPayze collections', async () => {
  await assertFails(getDoc(doc(bob(), 'ezpayze_paymentFacts/f1')));
  await assertFails(getDoc(doc(bob(), 'ezpayze_config/secrets')));
  await assertFails(setDoc(doc(bob(), 'ezpayze_users/bob'), { email: 'b@example.com' }));
  await assertFails(getDoc(doc(alice(), 'ezpayze_config/secrets')));
});

test('profile: editable, but never subscription or usage', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'ezpayze_users/alice'), { businessName: 'A2' }));
  await assertFails(updateDoc(doc(alice(), 'ezpayze_users/alice'), { 'subscription.plan': 'pro', 'subscription.status': 'active' }));
  await assertFails(updateDoc(doc(alice(), 'ezpayze_users/alice'), { 'usage.sms.2026-10': 0 }));
  await assertFails(updateDoc(doc(bob(), 'ezpayze_users/alice'), { businessName: 'hacked' }));
  await assertFails(deleteDoc(doc(alice(), 'ezpayze_users/alice')));
});

test('reminder state is functions-only', async () => {
  await assertFails(updateDoc(doc(alice(), 'ezpayze_users/alice/payments/p1'), { status: 'paid' }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/payments/p2'), { status: 'overdue' }));
  await assertFails(updateDoc(doc(alice(), 'ezpayze_users/alice/queue/2026-10-13'), { sentAt: 1 }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/stats/summary'), { openCount: 0 }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/payments/p1/events/e1'), { type: 'reminder_sent' }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/planRequests/r1'), { status: 'approved' }));
});

test('jobs: well-formed creates only; only attachments editable', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'ezpayze_users/alice/jobs/j2'), goodJob));
  await assertFails(setDoc(doc(bob(), 'ezpayze_users/alice/jobs/j3'), goodJob));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/jobs/j4'), { ...goodJob, status: 'paid' }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/jobs/j5'), { ...goodJob, totalAmount: 12.5 }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/jobs/j6'), { ...goodJob, limitBlocked: false }));
  await assertSucceeds(updateDoc(doc(alice(), 'ezpayze_users/alice/jobs/j1'), { attachments: ['ezpayze/users/alice/jobs/j1/a.pdf'] }));
  await assertFails(updateDoc(doc(alice(), 'ezpayze_users/alice/jobs/j1'), { status: 'paid' }));
  await assertFails(deleteDoc(doc(alice(), 'ezpayze_users/alice/jobs/j1')));
});

test('customers: owner only', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'ezpayze_users/alice/customers/c1'), { name: 'Jane', email: null, phone: null, createdAt: 1 }));
  await assertFails(setDoc(doc(bob(), 'ezpayze_users/alice/customers/c2'), { name: 'Jane' }));
  await assertFails(setDoc(doc(alice(), 'ezpayze_users/alice/customers/c3'), { name: '' }));
});

test('storage: owner-only PDFs and images under 10 MB', async () => {
  const a = env.authenticatedContext('alice').storage();
  const b = env.authenticatedContext('bob').storage();
  const pdf = new Uint8Array([37, 80, 68, 70]);
  await assertSucceeds(uploadBytes(ref(a, 'ezpayze/users/alice/jobs/j1/inv.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(a, 'ezpayze/users/alice/jobs/j1/inv.pdf')));
  await assertFails(getBytes(ref(b, 'ezpayze/users/alice/jobs/j1/inv.pdf')));
  await assertFails(uploadBytes(ref(b, 'ezpayze/users/alice/jobs/j1/x.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(a, 'ezpayze/users/alice/x.html'), pdf, { contentType: 'text/html' }));
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(ref(a, 'ezpayze/users/alice/big.pdf'), big, { contentType: 'application/pdf' }));
});
