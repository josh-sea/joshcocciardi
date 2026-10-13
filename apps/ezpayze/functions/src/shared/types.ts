// Shared EzPayze types. Everything in src/shared is pure TypeScript with no
// Node or Firebase imports, so the web app imports the same files (see the
// @shared alias in web/vite.config.ts) and both sides agree on shapes,
// schedules, wording, and math.
//
// Dates: due dates and reminder dates are calendar days in the owner's time
// zone, stored as "YYYY-MM-DD" keys. Moments (createdAt, paidAt, sentAt) are
// epoch milliseconds. Money is always integer cents.

export type PaymentMethodType =
  | 'venmo'
  | 'zelle'
  | 'cashapp'
  | 'paypal'
  | 'stripe'
  | 'check'
  | 'cash'
  | 'other';

export interface CheckDetails {
  payableTo: string;
  address: string;
}

export interface PaymentMethod {
  type: PaymentMethodType;
  label: string;
  value: string | CheckDetails;
  enabled?: boolean;
}

export type PlanName = 'free' | 'pro';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Subscription {
  plan: PlanName;
  smsAddon: boolean;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  trialEndsAt: number | null;
  currentPeriodEnd: number | null;
}

export type QueueMode = 'auto' | 'approve';

export interface QueueSettings {
  morningTime: string; // "07:00" local
  sendTime: string; // "11:00" local
  mode: QueueMode;
}

export type ReminderKind = 'courtesy' | 'friendly' | 'firm' | 'final';

export interface ReminderWording {
  subject: string;
  body: string;
}

export interface EzUser {
  email: string;
  ownerName: string;
  businessName: string;
  phone: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  replyToEmail: string;
  timezone: string;
  industry: string | null;
  subscription: Subscription;
  paymentMethods: PaymentMethod[];
  defaultPaymentMethod: string | null;
  showAllMethods: boolean;
  reminderSchedule: number[];
  courtesyNote: boolean;
  queue: QueueSettings;
  offerPaymentPlans: boolean;
  wording: Partial<Record<ReminderKind, ReminderWording>>;
  onboardingComplete: boolean;
  createdAt: number;
}

export interface Customer {
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: number;
}

export type JobStatus = 'open' | 'paid' | 'canceled';

export interface Job {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  title: string;
  referenceNumber: string | null;
  category: string | null;
  totalAmount: number;
  currency: 'USD';
  completedDate: string | null;
  dueDate: string;
  attachments: string[];
  hasPlan: boolean;
  status: JobStatus;
  limitBlocked?: boolean;
  createdAt: number;
  source: 'manual' | 'email_forward' | 'integration';
}

export type PaymentStatus = 'scheduled' | 'due' | 'overdue' | 'paid' | 'canceled';

export interface Installment {
  number: number;
  of: number;
}

export interface Payment {
  userId: string;
  jobId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  jobTitle: string;
  referenceNumber: string | null;
  category: string | null;
  amount: number;
  dueDate: string;
  installment: Installment | null;
  paymentMethodType: string | null;

  status: PaymentStatus;
  reminderStage: number;
  lastReminderSent: number | null;
  nextReminderDue: string | null; // date key; null = out of the scan
  paused: boolean;

  paidAt: string | null; // date key the owner says it was paid
  paidVia: string | null;
  markedPaidAt: number | null;
  markedPaidBy: 'owner' | 'stripe_webhook' | null;
  // Snapshot taken when marked paid, so undo can restore exactly.
  beforePaid?: Pick<Payment, 'status' | 'nextReminderDue'> | null;
  createdAt: number;
}

export type QueueItemState = 'pending' | 'approved' | 'paid' | 'held' | 'sent' | 'skipped' | 'failed';

export interface QueueItem {
  paymentId: string;
  stage: number;
  kind: ReminderKind;
  channel: 'email' | 'sms';
  state: QueueItemState;
  // Denormalized so the morning email and Today screen render without joins.
  customerName: string;
  jobTitle: string;
  amount: number;
  daysLate: number;
  error?: string;
}

export interface QueueDay {
  date: string;
  items: QueueItem[];
  readyAt: number;
  sentAt: number | null;
  morningEmailSentAt: number | null;
}

export type EventType =
  | 'created'
  | 'reminder_sent'
  | 'bounced'
  | 'marked_paid'
  | 'unmarked_paid'
  | 'held'
  | 'plan_offered'
  | 'plan_requested'
  | 'plan_created'
  | 'edited'
  | 'canceled';

export type PlanFrequency = 'monthly_first' | 'monthly_day' | 'biweekly' | 'custom';

export interface PlanSpec {
  count: number;
  frequency: PlanFrequency;
  startDate: string; // first due date for monthly_day / biweekly
  dayOfMonth?: number;
  customDates?: string[];
}

export interface PlanRequest {
  paymentId: string;
  jobId: string;
  customerName: string;
  jobTitle: string;
  amount: number;
  count: number;
  note: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: number;
}
