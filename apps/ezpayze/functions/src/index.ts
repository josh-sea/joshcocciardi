// EzPayze Cloud Functions. Everything is exported under one `ezpayze` group,
// so deployed names are ezpayze-markPaid, ezpayze-buildDailyQueue, and so on,
// and they can't collide with other apps in the shared Firebase project.
// Clients call them as httpsCallable(functions, 'ezpayze-<name>').
//
// This is its own functions codebase ("ezpayze" in firebase.json), so
//   firebase deploy --only functions:ezpayze
// touches nothing else.

import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';

setGlobalOptions({ maxInstances: 10, memory: '256MiB' });

import { ensureAccount } from './account/ensureAccount';
import { onJobCreate } from './jobs/onJobCreate';
import { markPaid, undoMarkPaid } from './jobs/markPaid';
import { cancelJob, editPayment, updateJob } from './jobs/actions';
import { buildDailyQueues } from './queue/buildDailyQueue';
import { sendDueQueues } from './queue/sendQueue';
import { queueAction, refreshToday, sendNow } from './queue/actions';
import { createPlan } from './plans/createPlan';
import { payPage, requestPlan, respondPlanRequest } from './plans/planRequest';
import { onPaymentPaid } from './analytics/onPaid';
import { nightly } from './analytics/rollups';
import { billingPortal, createCheckout, stripeBillingWebhook } from './billing/stripeBilling';
import { sendSample } from './reminders/sample';

export const ezpayze = {
  // Accounts
  ensureAccount,
  // Jobs and payments
  onJobCreate,
  markPaid,
  undoMarkPaid,
  updateJob,
  cancelJob,
  editPayment,
  // Morning checklist
  buildDailyQueue: onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 540 }, async () => {
    await buildDailyQueues();
  }),
  sendQueue: onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 540 }, async () => {
    await sendDueQueues();
  }),
  queueAction,
  sendNow,
  refreshToday,
  sendSample,
  // Payment plans
  createPlan,
  payPage,
  requestPlan,
  respondPlanRequest,
  // Dashboard
  onPaymentPaid,
  nightlyRollups: onSchedule({ schedule: 'every day 03:30', timeZone: 'America/New_York', timeoutSeconds: 540 }, async () => {
    await nightly();
  }),
  // Our subscription
  createCheckout,
  billingPortal,
  stripeBillingWebhook,
};
