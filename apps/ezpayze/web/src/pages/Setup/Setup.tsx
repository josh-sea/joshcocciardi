// Setup wizard: one question per screen, a progress bar, and Back on every
// step. Each step saves as you go, so closing the tab loses nothing.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { addDays } from '@shared/dates';
import { describeSchedule } from '@shared/schedule';
import { samplePayment } from '@shared/templates';
import { db, storage, USERS } from '../../lib/firebase';
import { useProfile } from '../../lib/auth';
import { api, errorText } from '../../lib/api';
import { ownerToday } from '../../lib/format';
import { useToast } from '../../lib/toast';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { MethodEditor, draftsFromMethods, methodsFromDrafts, type Drafts } from '../../components/MethodEditor';
import { JobForm } from '../../components/JobForm';
import { ReminderPreview } from '../../components/ReminderPreview';
import { isPro } from '@shared/billing';
import type { PaymentMethodType } from '@shared/types';

const TOTAL = 7;
export const SCHEDULE_PRESETS = [
  { days: [7, 14, 30], label: '7, 14, and 30 days late', sub: 'Recommended. Friendly, then firmer, then a final notice.' },
  { days: [3, 10, 21], label: '3, 10, and 21 days late', sub: 'Sooner. For jobs that should be paid right away.' },
  { days: [14, 30, 45], label: '14, 30, and 45 days late', sub: 'Gentler. For customers on longer terms.' },
];

function Step({ n, title, children, onBack, onNext, nextLabel = 'Next', busy, extra }: {
  n: number; title: string; children: ReactNode; onBack?: () => void; onNext: () => void; nextLabel?: string; busy?: boolean; extra?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [n]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }} noValidate>
      <div className="progress">
        <span className="label">Step {n} of {TOTAL}</span>
        <div className="bar" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={n} aria-label={`Step ${n} of ${TOTAL}`}>
          <div className="fill" style={{ width: `${(n / TOTAL) * 100}%` }} />
        </div>
      </div>
      <h1 tabIndex={-1} ref={heading}>{title}</h1>
      {children}
      <div className="wizard-nav">
        {onBack && (
          <button type="button" className="btn secondary big" onClick={onBack}>
            <Icon name="back" /> Back
          </button>
        )}
        <button type="submit" className="btn big" disabled={busy}>
          {busy ? 'Saving…' : nextLabel} {!busy && <Icon name="next" />}
        </button>
      </div>
      {extra}
    </form>
  );
}

export function Setup() {
  const { uid, profile } = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState(profile.ownerName ?? '');
  const [businessName, setBusinessName] = useState(profile.businessName ?? '');
  const [replyTo, setReplyTo] = useState(profile.replyToEmail || profile.email || '');
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFromMethods(profile.paymentMethods ?? []));
  const [defaultType, setDefaultType] = useState<string | null>(profile.defaultPaymentMethod ?? null);
  const [methodErrors, setMethodErrors] = useState<Partial<Record<PaymentMethodType, string>>>({});
  const [schedule, setSchedule] = useState<string>(JSON.stringify(profile.reminderSchedule ?? [7, 14, 30]));
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const today = ownerToday(profile);
  const userRef = doc(db, USERS, uid);
  const go = (n: number) => { setError(null); setStep(n); };
  const save = async (data: Record<string, unknown>, next: number) => {
    setBusy(true);
    setError(null);
    try {
      await updateDoc(userRef, data);
      go(next);
    } catch {
      setError('We could not save that. Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && <p className="error-text" role="alert">{error}</p>;

  switch (step) {
    case 1:
      return (
        <main id="main" tabIndex={-1}>
          <Step n={1} title="Welcome! What should we call you?" busy={busy} onNext={() => {
            if (!ownerName.trim() || !businessName.trim()) { setError('Please fill in both.'); return; }
            void save({ ownerName: ownerName.trim().slice(0, 80), businessName: businessName.trim().slice(0, 80) }, 2);
          }}>
            <p className="lead">This is how your reminders are signed.</p>
            <Field label="Your name" autoComplete="name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            <Field label="Your business name" autoComplete="organization" hint="Example: Smith Plumbing" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            {errorBox}
          </Step>
        </main>
      );
    case 2:
      return (
        <main id="main" tabIndex={-1}>
          <Step n={2} title="Where should customers' replies go?" busy={busy} onBack={() => go(1)} onNext={() => {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())) { setError('That email address does not look right.'); return; }
            void save({ replyToEmail: replyTo.trim().toLowerCase() }, 3);
          }}>
            <p className="lead">When a customer hits Reply on a reminder, it comes straight to this email address.</p>
            <Field label="Email for replies" type="email" autoComplete="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} error={error} />
          </Step>
        </main>
      );
    case 3:
      return (
        <main id="main" tabIndex={-1}>
          <Step n={3} title="How do you like to get paid?" busy={busy} onBack={() => go(2)} onNext={() => {
            const res = methodsFromDrafts(drafts);
            if ('errors' in res) { setMethodErrors(res.errors); setError('Please fix the highlighted spots.'); return; }
            setMethodErrors({});
            const def = res.methods.some((m) => m.type === defaultType) ? defaultType : res.methods[0].type;
            void save({ paymentMethods: res.methods, defaultPaymentMethod: def }, 4);
          }}>
            <p className="lead">We show these to your customers in every reminder. Money always goes straight to you.</p>
            <MethodEditor drafts={drafts} onChange={(d) => { setDrafts(d); setMethodErrors({}); }} errors={methodErrors} defaultType={defaultType} onDefaultChange={setDefaultType} />
            {errorBox}
          </Step>
        </main>
      );
    case 4:
      return (
        <main id="main" tabIndex={-1}>
          <Step n={4} title="Add your logo (optional)" busy={busy} onBack={() => go(3)} nextLabel={logoFile ? 'Upload and continue' : 'Skip for now'} onNext={async () => {
            if (!logoFile) { go(5); return; }
            if (logoFile.size > 2 * 1024 * 1024 || !logoFile.type.startsWith('image/')) { setError('Please pick a picture under 2 MB.'); return; }
            setBusy(true);
            try {
              const path = `ezpayze/users/${uid}/logo/${Date.now()}-${logoFile.name.replace(/[^\w.-]+/g, '_').slice(-60)}`;
              await uploadBytes(ref(storage, path), logoFile, { contentType: logoFile.type });
              const url = await getDownloadURL(ref(storage, path));
              await updateDoc(userRef, { logoPath: path, logoUrl: url });
              go(5);
            } catch {
              setError('We could not upload that picture. You can skip this and add it later in Settings.');
            } finally {
              setBusy(false);
            }
          }}>
            <p className="lead">It goes at the top of your reminders. You can skip this.</p>
            <div className="field">
              <label htmlFor="logo">Pick a picture of your logo</label>
              <input id="logo" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            </div>
            {profile.logoUrl && !logoFile && <p><img src={profile.logoUrl} alt="Your current logo" style={{ maxHeight: 80 }} /></p>}
            {errorBox}
          </Step>
        </main>
      );
    case 5:
      return (
        <main id="main" tabIndex={-1}>
          <Step n={5} title="When should reminders go out?" busy={busy} onBack={() => go(4)} onNext={() => void save({ reminderSchedule: JSON.parse(schedule) }, 6)}>
            <p className="lead">Counting from the day a job is due. Every morning you'll get a list of what's about to go out, so you can stop any that are already paid.</p>
            <fieldset>
              <legend className="sr-only">Reminder schedule</legend>
              <div className="tiles stack">
                {SCHEDULE_PRESETS.map((p) => {
                  const v = JSON.stringify(p.days);
                  return (
                    <div className="tile" key={v}>
                      <input type="radio" name="schedule" id={`s-${v}`} checked={schedule === v} onChange={() => setSchedule(v)} />
                      <label htmlFor={`s-${v}`}>
                        <span className="box" aria-hidden="true" />
                        <span>{p.label}<span className="sub">{p.sub}</span></span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {errorBox}
          </Step>
        </main>
      );
    case 6:
      return (
        <main id="main" tabIndex={-1}>
          <div className="progress">
            <span className="label">Step 6 of {TOTAL}</span>
            <div className="bar" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={6} aria-label={`Step 6 of ${TOTAL}`}>
              <div className="fill" style={{ width: `${(6 / TOTAL) * 100}%` }} />
            </div>
          </div>
          <h1>Add your first job</h1>
          <p className="lead">A job that's done and still owed. Or skip this and add one later.</p>
          <JobForm uid={uid} profile={profile} submitLabel="Save and continue" onDone={() => {
            toast({ message: 'Job saved.' });
            void save({ onboardingComplete: true }, 7);
          }} />
          <div className="wizard-nav">
            <button type="button" className="btn secondary big" onClick={() => go(5)}><Icon name="back" /> Back</button>
            <button type="button" className="btn secondary big" onClick={() => void save({ onboardingComplete: true }, 7)}>Skip for now</button>
          </div>
        </main>
      );
    default:
      return (
        <main id="main" tabIndex={-1}>
          <Step n={7} title="You're all set!" onBack={() => go(6)} nextLabel="Go to Today" busy={busy} onNext={async () => {
            if (!profile.onboardingComplete) await updateDoc(userRef, { onboardingComplete: true });
            navigate('/today');
          }}>
            <p className="lead">
              Reminders go out {describeSchedule(profile.reminderSchedule ?? [7, 14, 30])}. Each morning at 7am you'll see who's on the list, and they go out at 11am unless you check off anyone who already paid.
            </p>
            <p>Here's what your customers will get:</p>
            <ReminderPreview user={profile} payment={samplePayment(addDays(today, -7))} kind="friendly" today={today} allowCustom={isPro(profile.subscription)} />
            <div className="row-actions">
              <button type="button" className="btn secondary" onClick={async () => {
                try {
                  const r = await api.sendSample({ kind: 'friendly' });
                  toast({ message: `Sample sent to ${r.to}.` });
                } catch (err) {
                  toast({ message: errorText(err), error: true });
                }
              }}>
                <Icon name="send" /> Email me a sample
              </button>
            </div>
          </Step>
        </main>
      );
  }
}
