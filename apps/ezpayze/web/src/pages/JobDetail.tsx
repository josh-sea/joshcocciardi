import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { isPro } from '@shared/billing';
import { lateLabel, longDate } from '@shared/dates';
import { methodInfo } from '@shared/methods';
import { formatMoney, parseMoney } from '@shared/money';
import { nextStep } from '@shared/schedule';
import type { Job, Payment } from '@shared/types';
import { useProfile } from '../lib/auth';
import { api, errorText } from '../lib/api';
import { useDoc, useEvents, usePayments, type WithId } from '../lib/data';
import { db, storage, USERS } from '../lib/firebase';
import { ownerToday } from '../lib/format';
import { useToast } from '../lib/toast';
import { Loading } from '../components/Layout';
import { Dialog } from '../components/Dialog';
import { Field, MoneyField } from '../components/Field';
import { Icon } from '../components/Icon';
import { PaidDialog } from '../components/PaidDialog';
import { SplitDialog } from '../components/SplitDialog';

const EVENT_TEXT: Record<string, string> = {
  created: 'Added',
  reminder_sent: 'Reminder sent',
  marked_paid: 'Marked paid',
  unmarked_paid: 'Marked not paid',
  held: 'Put on hold for a day',
  plan_offered: 'Payment plan offered',
  plan_requested: 'Customer asked for a payment plan',
  plan_created: 'Payment plan set up',
  edited: 'Changed',
  canceled: 'Canceled',
  bounced: 'Email bounced',
};

function History({ uid, paymentId }: { uid: string; paymentId: string }) {
  const events = useEvents(uid, paymentId);
  if (!events.length) return null;
  return (
    <details className="help">
      <summary>History</summary>
      <ul>
        {events
          .filter((e) => !(e.type === 'reminder_sent' && e.meta?.state === 'sending'))
          .map((e) => (
            <li key={e.id}>
              {new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}: {EVENT_TEXT[e.type] ?? e.type}
              {e.type === 'reminder_sent' && typeof e.meta?.to === 'string' ? ` to ${e.meta.to}` : ''}
            </li>
          ))}
      </ul>
    </details>
  );
}

export function JobDetail() {
  const { jobId = '' } = useParams();
  const { uid, profile } = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const today = ownerToday(profile);
  const { data: job, loading } = useDoc<Job>([USERS, uid, 'jobs', jobId]);
  const { items: allPayments } = usePayments(uid);
  const [paying, setPaying] = useState<WithId<Payment> | null>(null);
  const [editing, setEditing] = useState<WithId<Payment> | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDue, setEditDue] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (loading) return <Loading />;
  if (!job) return (<><h1>Job not found</h1><p><Link to="/jobs">Back to jobs</Link></p></>);

  const payments = allPayments
    .filter((p) => p.jobId === jobId && p.status !== 'canceled')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const open = payments.filter((p) => p.status !== 'paid');
  const balance = open.reduce((s, p) => s + p.amount, 0);
  const pro = isPro(profile.subscription);
  const ladder = { reminderSchedule: profile.reminderSchedule, courtesyNote: profile.courtesyNote };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ message: ok });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    }
  };

  const markPaid = async (p: WithId<Payment>, via: string | null, paidAt: string) => {
    setPaying(null);
    try {
      await api.markPaid({ paymentId: p.id, paidVia: via, paidAt });
      toast({
        message: 'Marked paid.',
        actionLabel: 'Undo',
        onAction: () => api.undoMarkPaid({ paymentId: p.id }).then(() => undefined).catch((err) => toast({ message: errorText(err), error: true })),
      });
    } catch (err) {
      toast({ message: errorText(err), error: true });
    }
  };

  const openFile = async (path: string) => {
    try {
      window.open(await getDownloadURL(ref(storage, path)), '_blank', 'noopener');
    } catch {
      toast({ message: 'We could not open that file.', error: true });
    }
  };

  const addFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ message: 'Files must be under 10 MB.', error: true });
      return;
    }
    setUploading(true);
    try {
      const path = `ezpayze/users/${uid}/jobs/${jobId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type || 'application/pdf' });
      await updateDoc(doc(db, USERS, uid, 'jobs', jobId), { attachments: arrayUnion(path) });
      toast({ message: 'File added.' });
    } catch {
      toast({ message: 'We could not add that file. PDFs and pictures only, under 10 MB.', error: true });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <p><Link to="/jobs">← All jobs</Link></p>
      <h1>{job.title}</h1>
      <p className="lead">
        <strong>{job.customerName}</strong>
        {job.referenceNumber && <> · #{job.referenceNumber}</>}
        {job.category && <> · {job.category}</>}
      </p>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat"><span className="label">Job total</span><span className="value">{formatMoney(job.totalAmount)}</span></div>
        <div className="stat"><span className="label">Still owed</span><span className="value">{formatMoney(balance)}</span></div>
      </div>

      {job.status === 'paid' && <div className="card good"><strong>All paid. Nice work.</strong></div>}
      {job.status === 'canceled' && <div className="card tint"><strong>This job was canceled. No reminders go out.</strong></div>}
      {job.limitBlocked && job.status === 'open' && (
        <div className="card warn">Reminders are off for this job because free accounts cover {3} jobs at a time. <Link to="/settings#plan">Upgrade to Pro</Link> to turn them on.</div>
      )}

      <section className="card">
        <div className="split">
          <h2>Customer</h2>
          <button type="button" className="btn secondary" onClick={() => { setEmail(job.customerEmail ?? ''); setPhone(job.customerPhone ?? ''); setContactOpen(true); }}>Edit</button>
        </div>
        <p style={{ margin: 0 }}>Email: {job.customerEmail ?? <strong>none yet. Add one so reminders can go out.</strong>}</p>
        <p style={{ margin: 0 }}>Phone: {job.customerPhone ?? 'none'}</p>
      </section>

      <h2>{payments.length > 1 ? 'Payments' : 'Payment'}</h2>
      <ul className="list">
        {payments.map((p) => {
          const step = p.status !== 'paid' ? nextStep(p, ladder) : null;
          return (
            <li key={p.id} className="card">
              <div className="split">
                <strong style={{ fontSize: '1.2rem' }}>
                  {p.installment ? `Payment ${p.installment.number} of ${p.installment.of}: ` : ''}{formatMoney(p.amount)}
                </strong>
                {p.status === 'paid'
                  ? <span className="pill paid">Paid</span>
                  : <span className={`pill ${p.dueDate < today ? 'late' : 'soon'}`}>{lateLabel(p.dueDate, today)}</span>}
              </div>
              <p style={{ margin: '6px 0' }}>Due {longDate(p.dueDate)}</p>
              {p.status === 'paid' ? (
                <p>Paid {p.paidAt ? longDate(p.paidAt) : ''}{p.paidVia ? ` by ${methodInfo(p.paidVia).label}` : ''}.</p>
              ) : (
                <p>
                  {p.reminderStage > 0 ? `${p.reminderStage} reminder${p.reminderStage === 1 ? '' : 's'} sent. ` : 'No reminders sent yet. '}
                  {p.paused ? <strong>Reminders paused.</strong> : step && p.nextReminderDue ? `Next one ${p.nextReminderDue <= today ? 'goes out today' : `on ${longDate(p.nextReminderDue)}`}.` : 'No more reminders scheduled.'}
                </p>
              )}
              <div className="row-actions">
                {p.status !== 'paid' && job.status === 'open' && (
                  <>
                    <button type="button" className="btn good" onClick={() => setPaying(p)}><Icon name="check" /> Got paid</button>
                    <button type="button" className="btn secondary" onClick={() => run(() => api.editPayment({ paymentId: p.id, paused: !p.paused }), p.paused ? 'Reminders back on.' : 'Reminders paused.')}>
                      <Icon name="pause" /> {p.paused ? 'Turn reminders back on' : 'Pause reminders'}
                    </button>
                    <button type="button" className="btn secondary" onClick={() => { setEditing(p); setEditAmount((p.amount / 100).toFixed(2)); setEditDue(p.dueDate); }}>Change amount or date</button>
                  </>
                )}
                {p.status === 'paid' && (
                  <button type="button" className="btn secondary" onClick={() => run(() => api.undoMarkPaid({ paymentId: p.id, force: true }), 'Marked not paid. Reminders pick up again.')}>Not paid after all</button>
                )}
              </div>
              <History uid={uid} paymentId={p.id} />
            </li>
          );
        })}
      </ul>

      {job.status === 'open' && balance > 0 && (
        <section className="card tint">
          <h2>Split into payments</h2>
          <p>Let {job.customerName.split(' ')[0]} pay over time. We'll remind them before each one.</p>
          {pro ? (
            <button type="button" className="btn" onClick={() => setSplitOpen(true)}><Icon name="split" /> Split into payments</button>
          ) : (
            <p><strong>Payment plans are part of Pro.</strong> <Link to="/settings#plan">See plans</Link></p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Invoice and files</h2>
        {job.attachments.length === 0 && <p>No files yet.</p>}
        <ul className="list">
          {job.attachments.map((path) => (
            <li key={path}>
              <button type="button" className="btn secondary block" onClick={() => openFile(path)}>
                <Icon name="file" /> Open {path.split('/').pop()!.replace(/^\d+-/, '')}
              </button>
            </li>
          ))}
        </ul>
        <div className="field">
          <label htmlFor="addfile">Add a PDF or a photo of the invoice</label>
          <input id="addfile" type="file" accept="application/pdf,image/*" disabled={uploading} onChange={(e) => void addFile(e.target.files?.[0])} />
        </div>
        {!pro && <p className="hint">On Pro, attached invoices go out with every reminder.</p>}
      </section>

      {job.status === 'open' && (
        <button type="button" className="btn danger block" onClick={() => setCancelOpen(true)}>Cancel this job (stop all reminders)</button>
      )}

      <PaidDialog payment={paying} profile={profile} today={today} onClose={() => setPaying(null)} onConfirm={(via, at) => paying && markPaid(paying, via, at)} />

      <Dialog open={!!editing} title="Change amount or due date" onClose={() => setEditing(null)}>
        <MoneyField label="Amount" value={editAmount} onChange={setEditAmount} />
        <Field label="Due date" type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
        <div className="stack">
          <button type="button" className="btn big block" onClick={async () => {
            const cents = parseMoney(editAmount);
            if (!cents || !editDue || !editing) { toast({ message: 'Enter an amount and a date.', error: true }); return; }
            const p = editing;
            setEditing(null);
            await run(() => api.editPayment({ paymentId: p.id, amount: cents, dueDate: editDue }), 'Saved.');
          }}>Save</button>
          <button type="button" className="btn secondary block" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </Dialog>

      <Dialog open={contactOpen} title="Customer contact" onClose={() => setContactOpen(false)}>
        <Field label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Cell phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="stack">
          <button type="button" className="btn big block" onClick={async () => {
            setContactOpen(false);
            await run(() => api.updateJob({ jobId, customerEmail: email, customerPhone: phone }), 'Saved.');
          }}>Save</button>
          <button type="button" className="btn secondary block" onClick={() => setContactOpen(false)}>Cancel</button>
        </div>
      </Dialog>

      {splitOpen && (
        <SplitDialog open title="Split into payments" balance={balance} today={today} onClose={() => setSplitOpen(false)} onConfirm={async (spec) => {
          try {
            const r = await api.createPlan({ jobId, ...spec });
            setSplitOpen(false);
            toast({ message: `Done: ${r.description}.` });
          } catch (err) {
            toast({ message: errorText(err), error: true });
          }
        }} />
      )}

      <Dialog open={cancelOpen} title="Cancel this job?" onClose={() => setCancelOpen(false)}>
        <p className="lead">No more reminders will go out for {job.title}. Use this if the job fell through or you forgave the bill.</p>
        <div className="stack">
          <button type="button" className="btn danger big block" onClick={async () => {
            setCancelOpen(false);
            await run(() => api.cancelJob({ jobId }), 'Job canceled.');
            navigate('/jobs');
          }}>Yes, cancel the job</button>
          <button type="button" className="btn secondary block" onClick={() => setCancelOpen(false)}>Keep it</button>
        </div>
      </Dialog>
    </>
  );
}
