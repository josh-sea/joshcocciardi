// Today: the morning checklist. The owner checks off anyone who already paid,
// holds anyone they want to skip, and everything else goes out at sendTime.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isPro } from '@shared/billing';
import { formatTime, lateLabel, localParts, timeToMinutes } from '@shared/dates';
import { formatMoney } from '@shared/money';
import { nextStep } from '@shared/schedule';
import type { Payment, PlanSpec, QueueItem, ReminderKind } from '@shared/types';
import { useProfile } from '../lib/auth';
import { api, errorText } from '../lib/api';
import { usePayments, usePlanRequests, useQueueDay, type WithId } from '../lib/data';
import { ownerToday, plural } from '../lib/format';
import { useToast } from '../lib/toast';
import { Loading } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Dialog } from '../components/Dialog';
import { PaidDialog } from '../components/PaidDialog';
import { SplitDialog } from '../components/SplitDialog';
import { SwipeRow } from '../components/SwipeRow';

const KIND_TEXT: Record<ReminderKind, string> = {
  courtesy: 'Heads-up note',
  friendly: 'First reminder',
  firm: 'Firmer reminder',
  final: 'Final notice',
};

const STATE_TEXT: Partial<Record<QueueItem['state'], string>> = {
  paid: 'Paid. Not sending.',
  held: 'On hold until tomorrow.',
  sent: 'Sent.',
  skipped: 'Skipped.',
  failed: 'Could not send.',
  approved: 'Approved to send.',
};

export function Today() {
  const { uid, profile } = useProfile();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = ownerToday(profile);
  const { data: day, loading: dayLoading } = useQueueDay(uid, today);
  const { items: payments, loading: payLoading } = usePayments(uid);
  const { items: requests } = usePlanRequests(uid);
  const [paying, setPaying] = useState<WithId<Payment> | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const triedBuild = useRef(false);

  const byId = useMemo(() => new Map(payments.map((p) => [p.id, p])), [payments]);
  const { minutes } = localParts(Date.now(), profile.timezone);
  const beforeMorning = minutes < timeToMinutes(profile.queue.morningTime);
  const afterSend = minutes >= timeToMinutes(profile.queue.sendTime);
  const mode = profile.queue.mode;

  // Build today's list on demand once the morning time has passed.
  useEffect(() => {
    if (dayLoading || day || beforeMorning || triedBuild.current) return;
    triedBuild.current = true;
    api.refreshToday({}).catch(() => undefined);
  }, [dayLoading, day, beforeMorning]);

  // Before the list is built, preview what's lined up from live payments.
  const items: QueueItem[] = useMemo(() => {
    if (day) return day.items;
    const ladder = { reminderSchedule: profile.reminderSchedule, courtesyNote: profile.courtesyNote };
    return payments
      .filter((p) => p.nextReminderDue && p.nextReminderDue <= today && !p.paused && p.status !== 'paid' && p.status !== 'canceled')
      .map((p) => {
        const step = nextStep(p, ladder);
        return {
          paymentId: p.id, stage: p.reminderStage, kind: step?.kind ?? 'friendly', channel: 'email' as const, state: 'pending' as const,
          customerName: p.customerName, jobTitle: p.jobTitle, amount: p.amount, daysLate: 0,
        };
      });
  }, [day, payments, today, profile.reminderSchedule, profile.courtesyNote]);

  // Live payment state wins over the list's snapshot (e.g. paid a minute ago).
  const rows = items.map((i) => {
    const p = byId.get(i.paymentId);
    const state = p?.status === 'paid' && i.state !== 'sent' ? 'paid' : i.state;
    return { item: { ...i, state }, payment: p };
  });
  const active = rows.filter((r) => ['pending', 'approved', 'failed'].includes(r.item.state));
  const done = rows.filter((r) => !['pending', 'approved', 'failed'].includes(r.item.state));
  const toSend = active.filter((r) => r.item.state === 'approved' || (mode === 'auto' && r.item.state === 'pending'));
  const pendingRequests = requests.filter((r) => r.status === 'pending');

  const openTotal = payments.filter((p) => p.status !== 'paid' && p.status !== 'canceled');
  const openAmount = openTotal.reduce((s, p) => s + p.amount, 0);

  // Deep links from the morning email.
  useEffect(() => {
    const paid = params.get('paid');
    if (paid && byId.get(paid)) {
      const p = byId.get(paid)!;
      if (p.status !== 'paid') setPaying(p);
      params.delete('paid');
      setParams(params, { replace: true });
    }
    if (params.get('send') === '1') {
      setConfirmSend(true);
      params.delete('send');
      setParams(params, { replace: true });
    }
  }, [params, byId, setParams]);

  const markPaid = async (p: WithId<Payment>, via: string | null, paidAt: string) => {
    setPaying(null);
    try {
      await api.markPaid({ paymentId: p.id, paidVia: via, paidAt });
      toast({
        message: `${p.customerName} marked paid.`,
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await api.undoMarkPaid({ paymentId: p.id });
            toast({ message: 'Undone. Back on the list.' });
          } catch (err) {
            toast({ message: errorText(err), error: true });
          }
        },
      });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    }
  };

  const hold = async (paymentId: string, name: string) => {
    try {
      await api.queueAction({ action: 'hold', paymentId });
      toast({
        message: `${name} is on hold until tomorrow.`,
        actionLabel: 'Undo',
        onAction: async () => {
          await api.queueAction({ action: 'unhold', paymentId }).catch((err) => toast({ message: errorText(err), error: true }));
        },
      });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    }
  };

  const approve = async (paymentId: string, on: boolean) => {
    try {
      const r = await api.queueAction({ action: on ? 'approve' : 'unapprove', paymentId });
      if (r.sent) toast({ message: 'Sent.' });
      else if (r.reason) toast({ message: `Not sent: ${r.reason}`, error: true });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const r = await api.sendNow({});
      setConfirmSend(false);
      toast({
        message: r.failed
          ? `Sent ${plural(r.sent, 'reminder')}. ${plural(r.failed, 'could', 'could')} not be sent; see the list.`
          : `Sent ${plural(r.sent, 'reminder')}.`,
        error: !!r.failed,
      });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    } finally {
      setSending(false);
    }
  };

  const respond = async (requestId: string, action: 'approve' | 'decline', plan?: Partial<PlanSpec>) => {
    try {
      const r = await api.respondPlanRequest({ requestId, action, plan });
      setChanging(null);
      toast({ message: action === 'approve' ? `Plan set up: ${r.description}. We let them know.` : 'Declined. Reminders continue as usual.' });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    }
  };

  if (dayLoading || payLoading) return <Loading />;

  const sendTime = formatTime(profile.queue.sendTime);
  const morningTime = formatTime(profile.queue.morningTime);
  let headline: string;
  if (!active.length) headline = 'Nothing to send today. Nice.';
  else if (mode === 'auto') headline = afterSend && day?.sentAt ? `${plural(active.length, 'reminder')} still waiting` : `${plural(active.length, 'reminder')} will go out at ${sendTime}`;
  else headline = `${plural(active.length, 'reminder')} waiting for your OK`;

  const changingReq = pendingRequests.find((r) => r.id === changing);

  return (
    <>
      <h1>Today</h1>

      {pendingRequests.map((r) => (
        <div className="card warn" key={r.id}>
          <h2 style={{ fontSize: '1.2rem' }}>{r.customerName} asked to pay {formatMoney(r.amount)} in {r.count} payments.</h2>
          <p>For: {r.jobTitle}</p>
          {r.note && <p>Their note: "{r.note}"</p>}
          {!isPro(profile.subscription) && <p><strong>Payment plans are part of Pro.</strong> <Link to="/settings#plan">Upgrade</Link> to approve it.</p>}
          <div className="row-actions">
            <button className="btn good" type="button" onClick={() => respond(r.id, 'approve')}>Approve</button>
            <button className="btn secondary" type="button" onClick={() => setChanging(r.id)}>Change</button>
            <button className="btn danger" type="button" onClick={() => respond(r.id, 'decline')}>Decline</button>
          </div>
        </div>
      ))}

      {beforeMorning && !day && (
        <p className="card tint">Your list for today is ready at {morningTime}. Here's what's lined up so far.</p>
      )}

      <div className="split" style={{ marginBottom: 12 }}>
        <p className="lead" style={{ margin: 0 }}><strong>{headline}</strong></p>
      </div>
      {active.length > 0 && (
        <p className="muted">
          {mode === 'auto'
            ? 'Already paid? Tap "Got paid" so we don\'t bother them. Want to wait a day? Tap "Hold".'
            : 'Tap "Send this one" for each reminder you want to go out.'}
        </p>
      )}

      {active.length === 0 ? (
        <div className="empty">
          <span className="big">Nothing to send today. Nice.</span>
          {openTotal.length > 0 ? (
            <p>You're still owed <strong>{formatMoney(openAmount)}</strong> across {plural(openTotal.length, 'payment')}. <Link to="/jobs">See who owes you</Link>.</p>
          ) : (
            <p>No one owes you right now. <Link to="/add">Add a job</Link> when you finish one.</p>
          )}
        </div>
      ) : (
        <ul className="list" aria-label="Reminders for today">
          {active.map(({ item, payment }) => (
            <li key={item.paymentId}>
              <SwipeRow
                rightLabel="Got paid"
                leftLabel="Hold"
                onRight={payment ? () => setPaying(payment) : undefined}
                onLeft={() => hold(item.paymentId, item.customerName)}
              >
                <div className="item-row">
                  <div className="split">
                    <span className="name">{item.customerName}</span>
                    <span className="amount">{formatMoney(item.amount)}</span>
                  </div>
                  <span className="meta">{item.jobTitle}</span>
                  <span className="meta">
                    <span className="pill late">{payment ? lateLabel(payment.dueDate, today) : `${item.daysLate} days late`}</span>{' '}
                    {KIND_TEXT[item.kind]}{payment && !payment.customerEmail && ' · No email address yet'}
                  </span>
                  {item.state === 'failed' && <p className="error-text">{STATE_TEXT.failed} {item.error}</p>}
                  {item.state === 'approved' && <p><span className="pill paid">✓ {STATE_TEXT.approved}</span></p>}
                  <div className="row-actions">
                    {payment && (
                      <button type="button" className="btn good" onClick={() => setPaying(payment)}>
                        <Icon name="check" /> Got paid
                      </button>
                    )}
                    <button type="button" className="btn secondary" onClick={() => hold(item.paymentId, item.customerName)}>
                      <Icon name="pause" /> Hold
                    </button>
                    {mode === 'approve' && day && (
                      <button type="button" className="btn secondary" aria-pressed={item.state === 'approved'} onClick={() => approve(item.paymentId, item.state !== 'approved')}>
                        <Icon name="send" /> {item.state === 'approved' ? 'Approved' : 'Send this one'}
                      </button>
                    )}
                    {payment && <Link className="btn plain" to={`/jobs/${payment.jobId}`}>See job</Link>}
                  </div>
                </div>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}

      {toSend.length > 0 && (
        <button type="button" className="btn big block" onClick={() => setConfirmSend(true)} style={{ marginTop: 8 }}>
          <Icon name="send" /> {mode === 'auto' ? 'Looks good, send them now' : `Send ${plural(toSend.length, 'approved reminder')} now`}
        </button>
      )}

      {done.length > 0 && (
        <details className="help" style={{ marginTop: 24 }}>
          <summary>Done for today ({done.length})</summary>
          <ul className="list" style={{ marginTop: 12 }}>
            {done.map(({ item, payment }) => (
              <li key={item.paymentId} className="item-row">
                <div className="split">
                  <span className="name">{item.customerName}</span>
                  <span className="amount">{formatMoney(item.amount)}</span>
                </div>
                <span className="meta">{item.jobTitle}</span>
                <p style={{ margin: '6px 0 0' }}>
                  <span className={`pill ${item.state === 'paid' || item.state === 'sent' ? 'paid' : 'muted'}`}>{STATE_TEXT[item.state] ?? item.state}</span>
                </p>
                {item.state === 'held' && (
                  <div className="row-actions">
                    <button type="button" className="btn secondary" onClick={() => api.queueAction({ action: 'unhold', paymentId: item.paymentId }).catch((err) => toast({ message: errorText(err), error: true }))}>
                      Put back on today's list
                    </button>
                  </div>
                )}
                {item.state === 'paid' && payment?.markedPaidAt && Date.now() - payment.markedPaidAt < 3600000 && (
                  <div className="row-actions">
                    <button type="button" className="btn secondary" onClick={() => api.undoMarkPaid({ paymentId: item.paymentId }).catch((err) => toast({ message: errorText(err), error: true }))}>
                      Undo "Got paid"
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <PaidDialog payment={paying} profile={profile} today={today} onClose={() => setPaying(null)} onConfirm={(via, at) => paying && markPaid(paying, via, at)} />

      <Dialog open={confirmSend} title="Send reminders now?" onClose={() => setConfirmSend(false)}>
        <p className="lead">
          {mode === 'auto'
            ? `We'll send ${plural(toSend.length, 'reminder')} right away instead of waiting until ${sendTime}.`
            : `We'll send the ${plural(toSend.length, 'reminder')} you approved.`}
        </p>
        <p>Anyone you marked paid or put on hold is left out.</p>
        <div className="stack">
          <button type="button" className="btn big block" disabled={sending} onClick={sendNow}>{sending ? 'Sending…' : 'Yes, send now'}</button>
          <button type="button" className="btn secondary block" onClick={() => setConfirmSend(false)}>Not yet</button>
        </div>
      </Dialog>

      {changingReq && (
        <SplitDialog
          open
          title={`Change ${changingReq.customerName}'s plan`}
          balance={changingReq.amount}
          today={today}
          initialCount={changingReq.count}
          confirmLabel="Approve this plan"
          onClose={() => setChanging(null)}
          onConfirm={(spec) => respond(changingReq.id, 'approve', spec)}
        />
      )}
    </>
  );
}
