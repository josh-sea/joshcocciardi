// Typed wrappers for the ezpayze-* callables.
import { httpsCallable } from 'firebase/functions';
import type { PaymentMethod, PlanSpec } from '@shared/types';
import type { PlanRow } from '@shared/plan';
import { functions } from './firebase';

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, `ezpayze-${name}`);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export const api = {
  ensureAccount: call<{ timezone: string }, { created: boolean }>('ensureAccount'),
  markPaid: call<{ paymentId: string; paidVia: string | null; paidAt?: string }, { ok: boolean; undoUntil: number }>('markPaid'),
  undoMarkPaid: call<{ paymentId: string; force?: boolean }, { ok: boolean }>('undoMarkPaid'),
  queueAction: call<{ action: 'hold' | 'unhold' | 'approve' | 'unapprove'; paymentId: string }, { ok: boolean; sent?: boolean; reason?: string | null }>('queueAction'),
  sendNow: call<Record<string, never>, { ok: boolean; sent: number; failed: number }>('sendNow'),
  refreshToday: call<Record<string, never>, { ok: boolean; built: boolean; today: string }>('refreshToday'),
  sendSample: call<{ kind?: string }, { ok: boolean; to: string }>('sendSample'),
  updateJob: call<Record<string, unknown>, { ok: boolean }>('updateJob'),
  cancelJob: call<{ jobId: string }, { ok: boolean }>('cancelJob'),
  editPayment: call<Record<string, unknown>, { ok: boolean }>('editPayment'),
  createPlan: call<{ jobId: string } & PlanSpec, { ok: boolean; rows: PlanRow[]; description: string }>('createPlan'),
  respondPlanRequest: call<{ requestId: string; action: 'approve' | 'decline'; plan?: Partial<PlanSpec> }, { ok: boolean; description?: string }>('respondPlanRequest'),
  createCheckout: call<{ interval: 'month' | 'year'; sms: boolean }, { url: string }>('createCheckout'),
  billingPortal: call<Record<string, never>, { url: string }>('billingPortal'),
  payPage: call<{ token: string }, PayPageData>('payPage'),
  requestPlan: call<{ token: string; count: number; note: string }, { ok: boolean }>('requestPlan'),
};

export interface PayPageData {
  businessName: string;
  ownerName: string;
  logoUrl: string | null;
  replyToEmail: string;
  phone: string | null;
  customerName: string;
  jobTitle: string;
  referenceNumber: string | null;
  amount: number;
  dueDate: string;
  installment: { number: number; of: number } | null;
  status: 'open' | 'paid' | 'canceled';
  methods: PaymentMethod[];
  planOptions: number[];
  planRequest: { status: string; count: number } | null;
  today: string;
}

/** Plain-words message from a callable error. */
export function errorText(err: unknown): string {
  const e = err as { message?: string; code?: string };
  if (e?.code === 'functions/unavailable' || e?.code === 'unavailable') return 'We could not reach EzPayze. Check your internet and try again.';
  const msg = e?.message?.replace(/^.*?: /, '') ?? '';
  return msg && msg.length < 200 && !/internal/i.test(msg) ? msg : 'Something went wrong. Please try again.';
}
