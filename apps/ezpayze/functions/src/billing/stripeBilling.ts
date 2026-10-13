// Stripe Billing for OUR subscription only (Pro, and the text add-on). This is
// the only money EzPayze ever touches. Customers' payments never pass through
// here or anywhere else in EzPayze.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { Subscription, SubscriptionStatus } from '../shared/types';
import { appSettings, getSecret } from '../lib/config';
import { COL, db, userRef } from '../lib/firebase';
import { requireUser } from '../lib/users';

type Params = Record<string, string | number | boolean | undefined>;

async function stripe<T>(path: string, params: Params = {}, method = 'POST'): Promise<T> {
  const key = await getSecret('STRIPE_SECRET_KEY');
  if (!key) throw new HttpsError('failed-precondition', 'Billing is not set up yet. Please try again later.');
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body.toString(),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new HttpsError('internal', `Billing error: ${json.error?.message ?? res.status}`);
  return json;
}

async function ensureCustomer(uid: string, email: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const customer = await stripe<{ id: string }>('customers', { email, 'metadata[uid]': uid, 'metadata[app]': 'ezpayze' });
  await db.collection(COL.stripeCustomers).doc(customer.id).set({ uid });
  await userRef(uid).update({ 'subscription.stripeCustomerId': customer.id });
  return customer.id;
}

export const createCheckout = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const settings = await appSettings();
  const yearly = req.data?.interval === 'year';
  const price = yearly ? settings.stripePriceYearly : settings.stripePriceMonthly;
  if (!price) throw new HttpsError('failed-precondition', 'Billing is not set up yet. Please try again later.');
  const customer = await ensureCustomer(uid, user.email, user.subscription.stripeCustomerId);
  const params: Params = {
    mode: 'subscription',
    customer,
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    success_url: `${settings.appUrl}/settings?billing=done`,
    cancel_url: `${settings.appUrl}/settings`,
    'subscription_data[metadata][uid]': uid,
    'subscription_data[metadata][app]': 'ezpayze',
    allow_promotion_codes: true,
  };
  if (req.data?.sms && settings.stripePriceSms) {
    params['line_items[1][price]'] = settings.stripePriceSms;
    params['line_items[1][quantity]'] = 1;
  }
  const session = await stripe<{ url: string }>('checkout/sessions', params);
  return { url: session.url };
});

export const billingPortal = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const settings = await appSettings();
  const customer = await ensureCustomer(uid, user.email, user.subscription.stripeCustomerId);
  const session = await stripe<{ url: string }>('billing_portal/sessions', {
    customer,
    return_url: `${settings.appUrl}/settings`,
  });
  return { url: session.url };
});

/** Verify a Stripe-Signature header (t=..., v1=...) against the raw body. */
export function verifyStripeSignature(raw: Buffer, header: string, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const sigs = header
    .split(',')
    .filter((kv) => kv.trim().startsWith('v1='))
    .map((kv) => kv.trim().slice(3));
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest();
  return sigs.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items?: { data: { price: { id: string }; current_period_end?: number }[] };
}

export function subscriptionFromStripe(
  sub: StripeSubscription,
  smsPrice: string | null,
  previous: Partial<Subscription>,
): Subscription {
  const map: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    unpaid: 'past_due',
  };
  const status = map[sub.status] ?? 'canceled';
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return {
    plan: status === 'canceled' ? 'free' : 'pro',
    status: status === 'canceled' ? 'active' : status,
    smsAddon: status !== 'canceled' && !!smsPrice && !!sub.items?.data?.some((i) => i.price.id === smsPrice),
    stripeCustomerId: sub.customer,
    trialEndsAt: status === 'trialing' ? (previous.trialEndsAt ?? null) : null,
    currentPeriodEnd: periodEnd ? periodEnd * 1000 : null,
  };
}

export const stripeBillingWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('POST only');
    return;
  }
  const secret = await getSecret('STRIPE_BILLING_WEBHOOK_SECRET');
  const header = req.get('stripe-signature') ?? '';
  if (!secret || !verifyStripeSignature(req.rawBody, header, secret)) {
    res.status(400).send('bad signature');
    return;
  }
  const event = req.body as { type: string; data: { object: StripeSubscription } };
  if (!event.type?.startsWith('customer.subscription.')) {
    res.status(200).send('ignored');
    return;
  }
  const sub = event.data.object;
  if (sub.metadata?.app && sub.metadata.app !== 'ezpayze') {
    res.status(200).send('not ours');
    return;
  }
  let uid = sub.metadata?.uid;
  if (!uid) uid = (await db.collection(COL.stripeCustomers).doc(sub.customer).get()).get('uid');
  if (!uid) {
    logger.warn('stripe webhook: unknown customer', { customer: sub.customer });
    res.status(200).send('unknown customer');
    return;
  }
  const settings = await appSettings();
  const ref = userRef(uid);
  // Fetch the latest copy so out-of-order events settle on Stripe's current state.
  let latest = sub;
  try {
    latest = await stripe<StripeSubscription>(`subscriptions/${sub.id}`, {}, 'GET');
  } catch {
    // Fall back to the event's copy.
  }
  const current = ((await ref.get()).get('subscription') ?? {}) as Partial<Subscription>;
  await ref.update({ subscription: subscriptionFromStripe(latest, settings.stripePriceSms, current) });
  res.status(200).send('ok');
});
