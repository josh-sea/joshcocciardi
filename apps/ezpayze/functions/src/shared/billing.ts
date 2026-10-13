// Our own subscription rules. These are enforced in Cloud Functions; the web
// app only uses them to explain limits before someone hits one.

import type { Subscription } from './types';

export const FREE_OPEN_JOB_LIMIT = 3;
export const TRIAL_DAYS = 14;
export const SMS_MONTHLY_CAP = 300;

export const PRICES = {
  proMonthly: '$15/month',
  proYearly: '$150/year',
  smsAddon: '+$5/month',
};

export function isPro(sub: Partial<Subscription> | undefined, now = Date.now()): boolean {
  if (!sub || sub.plan !== 'pro') return false;
  if (sub.status === 'active' || sub.status === 'past_due') return true;
  if (sub.status === 'trialing') return !sub.trialEndsAt || sub.trialEndsAt > now;
  return false;
}

export function hasSms(sub: Partial<Subscription> | undefined, now = Date.now()): boolean {
  return isPro(sub, now) && !!sub?.smsAddon && sub.status !== 'trialing';
}

export function trialDaysLeft(sub: Partial<Subscription> | undefined, now = Date.now()): number | null {
  if (sub?.status !== 'trialing' || !sub.trialEndsAt) return null;
  return Math.max(0, Math.ceil((sub.trialEndsAt - now) / 86400000));
}

export function defaultSubscription(now = Date.now()): Subscription {
  return {
    plan: 'pro',
    smsAddon: false,
    status: 'trialing',
    stripeCustomerId: null,
    trialEndsAt: now + TRIAL_DAYS * 86400000,
    currentPeriodEnd: null,
  };
}
