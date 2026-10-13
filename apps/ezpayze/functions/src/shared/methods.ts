// How-you-get-paid catalog. New method types only need an entry here; the
// stored shape ({ type, label, value }) never changes.

import type { CheckDetails, PaymentMethod, PaymentMethodType } from './types';

export interface MethodInfo {
  type: PaymentMethodType;
  label: string;
  kind: 'link' | 'check' | 'text';
  ask: string; // the one question we ask in setup
  example: string;
  help: string; // "Where do I find this?"
  setupGuide?: string; // "Don't have one? We'll help you set it up"
}

export const METHOD_CATALOG: MethodInfo[] = [
  {
    type: 'venmo',
    label: 'Venmo',
    kind: 'link',
    ask: 'Your Venmo username or link',
    example: '@Smith-Plumbing or https://venmo.com/u/Smith-Plumbing',
    help: 'Open Venmo, tap the "Me" tab. Your username starts with @ and is under your name.',
    setupGuide: 'https://venmo.com/business/',
  },
  {
    type: 'zelle',
    label: 'Zelle',
    kind: 'text',
    ask: 'The email or phone number your Zelle uses',
    example: 'smithplumbing@gmail.com or (555) 123-4567',
    help: 'Open your bank app and look for Zelle in the menu. It shows the email or phone number you signed up with.',
  },
  {
    type: 'cashapp',
    label: 'Cash App',
    kind: 'link',
    ask: 'Your Cash App $cashtag',
    example: '$SmithPlumbing',
    help: 'Open Cash App and tap the profile picture in the top corner. Your $cashtag is under your name.',
    setupGuide: 'https://cash.app/help/us/en-us/3127-create-a-business-account',
  },
  {
    type: 'paypal',
    label: 'PayPal',
    kind: 'link',
    ask: 'Your PayPal.me link',
    example: 'https://paypal.me/SmithPlumbing',
    help: 'Log in to PayPal, open your profile, and look for "PayPal.me". Copy the link it shows.',
    setupGuide: 'https://www.paypal.com/paypalme/',
  },
  {
    type: 'stripe',
    label: 'Card',
    kind: 'link',
    ask: 'Your card payment link (from Stripe, Square, or similar)',
    example: 'https://buy.stripe.com/abc123',
    help: 'In Stripe, open "Payment Links" and copy the link. In Square, open "Online Checkout" and copy the link.',
    setupGuide: 'https://stripe.com/payments/payment-links',
  },
  {
    type: 'check',
    label: 'Check',
    kind: 'check',
    ask: 'Who to make checks out to, and where to mail them',
    example: 'Smith Plumbing LLC, 12 Main St, Springfield, NY 10001',
    help: 'Use the exact name on your business bank account.',
  },
  {
    type: 'cash',
    label: 'Cash',
    kind: 'text',
    ask: 'How should people pay you in cash?',
    example: 'Pay in person. Call (555) 123-4567 to arrange.',
    help: 'A short note telling people how to hand you cash.',
  },
  {
    type: 'other',
    label: 'Other',
    kind: 'text',
    ask: 'Tell customers how to pay',
    example: 'Apple Cash to (555) 123-4567',
    help: 'Anything else you accept.',
  },
];

export function methodInfo(type: string): MethodInfo {
  return METHOD_CATALOG.find((m) => m.type === type) ?? METHOD_CATALOG[METHOD_CATALOG.length - 1];
}

export function isSafeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Turn what an owner typed into the stored value, or an error in plain words. */
export function normalizeMethodValue(
  type: PaymentMethodType,
  raw: string | CheckDetails,
): { value: string | CheckDetails } | { error: string } {
  if (type === 'check') {
    const c = raw as CheckDetails;
    const payableTo = String(c?.payableTo ?? '').trim();
    const address = String(c?.address ?? '').trim();
    if (!payableTo) return { error: 'Who should checks be made out to?' };
    if (!address) return { error: 'Where should checks be mailed?' };
    return { value: { payableTo, address } };
  }
  const s = String(raw ?? '').trim();
  if (!s) return { error: 'Please fill this in, or turn this method off.' };
  switch (type) {
    case 'venmo': {
      if (/^https?:\/\//i.test(s)) return isSafeUrl(s) ? { value: s } : { error: 'That link should start with https://' };
      const handle = s.replace(/^@/, '');
      if (!/^[A-Za-z0-9_-]{2,40}$/.test(handle)) return { error: 'Venmo usernames use letters, numbers, - and _.' };
      return { value: `https://venmo.com/u/${handle}` };
    }
    case 'cashapp': {
      if (/^https?:\/\//i.test(s)) return isSafeUrl(s) ? { value: s } : { error: 'That link should start with https://' };
      const tag = s.replace(/^\$/, '');
      if (!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(tag)) return { error: 'A $cashtag is letters and numbers, like $SmithPlumbing.' };
      return { value: `https://cash.app/$${tag}` };
    }
    case 'paypal': {
      if (/^https?:\/\//i.test(s)) return isSafeUrl(s) ? { value: s } : { error: 'That link should start with https://' };
      const name = s.replace(/^(www\.)?paypal\.me\//i, '');
      if (!/^[A-Za-z0-9]{1,20}$/.test(name)) return { error: 'Paste your full PayPal.me link.' };
      return { value: `https://paypal.me/${name}` };
    }
    case 'stripe': {
      const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      return isSafeUrl(url) ? { value: url } : { error: 'Paste the full link, starting with https://' };
    }
    default:
      return { value: s.slice(0, 300) };
  }
}

export function enabledMethods(methods: PaymentMethod[] | undefined): PaymentMethod[] {
  return (methods ?? []).filter((m) => m.enabled !== false);
}

/** Methods to show a customer: the default (or the payment's override) first. */
export function methodsToShow(
  methods: PaymentMethod[] | undefined,
  opts: { defaultType?: string | null; overrideType?: string | null; showAll?: boolean },
): PaymentMethod[] {
  const list = enabledMethods(methods);
  const first = opts.overrideType || opts.defaultType;
  const sorted = [...list].sort((a, b) => Number(b.type === first) - Number(a.type === first));
  if (opts.showAll === false || opts.overrideType) return sorted.slice(0, 1);
  return sorted;
}
