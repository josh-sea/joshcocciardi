// Admin SDK handles and the EzPayze namespace. The Firebase project is shared
// with other apps, so every EzPayze collection starts with "ezpayze_" (the
// repo-wide convention the catch-all rule in firestore.rules relies on), and
// every Storage path starts with "ezpayze/".

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const auth = () => getAuth();
export const bucket = () => getStorage().bucket();

export const COL = {
  users: 'ezpayze_users',
  facts: 'ezpayze_paymentFacts',
  config: 'ezpayze_config',
  stripeCustomers: 'ezpayze_stripeCustomers',
} as const;

export const userRef = (uid: string) => db.collection(COL.users).doc(uid);
export const customersCol = (uid: string) => userRef(uid).collection('customers');
export const jobsCol = (uid: string) => userRef(uid).collection('jobs');
export const paymentsCol = (uid: string) => userRef(uid).collection('payments');
export const queueCol = (uid: string) => userRef(uid).collection('queue');
export const planRequestsCol = (uid: string) => userRef(uid).collection('planRequests');
export const statsRef = (uid: string) => userRef(uid).collection('stats').doc('summary');
export const eventsCol = (uid: string, paymentId: string) => paymentsCol(uid).doc(paymentId).collection('events');

export const STORAGE_PREFIX = 'ezpayze/users';
