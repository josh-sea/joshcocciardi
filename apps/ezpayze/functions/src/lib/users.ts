import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defaultSubscription } from '../shared/billing';
import { cleanSchedule } from '../shared/schedule';
import type { EzUser } from '../shared/types';
import { userRef } from './firebase';

/** Fill defaults so older or partial profiles never break a send. */
export function normalizeUser(raw: Partial<EzUser> | undefined, fallbackEmail = ''): EzUser {
  const r = raw ?? {};
  return {
    email: r.email ?? fallbackEmail,
    ownerName: r.ownerName ?? '',
    businessName: r.businessName || 'Your business',
    phone: r.phone ?? null,
    logoPath: r.logoPath ?? null,
    logoUrl: r.logoUrl ?? null,
    replyToEmail: r.replyToEmail || r.email || fallbackEmail,
    timezone: r.timezone || 'America/New_York',
    industry: r.industry ?? null,
    subscription: { ...defaultSubscription(0), plan: 'free', status: 'active', trialEndsAt: null, ...(r.subscription ?? {}) },
    paymentMethods: Array.isArray(r.paymentMethods) ? r.paymentMethods : [],
    defaultPaymentMethod: r.defaultPaymentMethod ?? null,
    showAllMethods: r.showAllMethods !== false,
    reminderSchedule: cleanSchedule(r.reminderSchedule),
    courtesyNote: !!r.courtesyNote,
    queue: {
      morningTime: r.queue?.morningTime || '07:00',
      sendTime: r.queue?.sendTime || '11:00',
      mode: r.queue?.mode === 'approve' ? 'approve' : 'auto',
    },
    offerPaymentPlans: r.offerPaymentPlans !== false,
    wording: r.wording ?? {},
    onboardingComplete: !!r.onboardingComplete,
    createdAt: r.createdAt ?? Date.now(),
  };
}

export async function loadUser(uid: string): Promise<EzUser | null> {
  const snap = await userRef(uid).get();
  if (!snap.exists) return null;
  return normalizeUser(snap.data() as Partial<EzUser>);
}

export function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.');
  return uid;
}

export async function requireUser(req: CallableRequest): Promise<{ uid: string; user: EzUser }> {
  const uid = requireUid(req);
  const user = await loadUser(uid);
  if (!user) throw new HttpsError('failed-precondition', 'Finish setting up your account first.');
  return { uid, user };
}

export function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
