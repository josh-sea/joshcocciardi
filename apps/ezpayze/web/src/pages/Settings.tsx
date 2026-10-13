import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FREE_OPEN_JOB_LIMIT, isPro, PRICES, trialDaysLeft } from '@shared/billing';
import { addDays, longDate } from '@shared/dates';
import { cleanSchedule, describeSchedule } from '@shared/schedule';
import { DEFAULT_WORDING, KIND_LABELS, PLACEHOLDERS, samplePayment } from '@shared/templates';
import type { PaymentMethodType, QueueMode, ReminderKind, ReminderWording } from '@shared/types';
import { useAuth, useProfile } from '../lib/auth';
import { api, errorText } from '../lib/api';
import { db, storage, USERS } from '../lib/firebase';
import { ownerToday } from '../lib/format';
import { useToast } from '../lib/toast';
import { Field } from '../components/Field';
import { MethodEditor, draftsFromMethods, methodsFromDrafts, type Drafts } from '../components/MethodEditor';
import { ReminderPreview } from '../components/ReminderPreview';
import { SCHEDULE_PRESETS } from './Setup/Setup';

function Section({ id, title, children, onSave, saving }: { id: string; title: string; children: ReactNode; onSave?: () => void; saving?: boolean }) {
  return (
    <section className="card" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {onSave ? (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(); }} noValidate>
          {children}
          <button type="submit" className="btn big" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </form>
      ) : children}
    </section>
  );
}

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
const ZONE_NAMES: Record<string, string> = {
  'America/New_York': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain', 'America/Phoenix': 'Arizona',
  'America/Los_Angeles': 'Pacific', 'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii',
};

export function Settings() {
  const { uid, profile } = useProfile();
  const { signOut } = useAuth();
  const toast = useToast();
  const loc = useLocation();
  const [params] = useSearchParams();
  const userRef = doc(db, USERS, uid);
  const today = ownerToday(profile);
  const pro = isPro(profile.subscription);
  const [saving, setSaving] = useState<string | null>(null);

  // Business
  const [ownerName, setOwnerName] = useState(profile.ownerName);
  const [businessName, setBusinessName] = useState(profile.businessName);
  const [replyTo, setReplyTo] = useState(profile.replyToEmail);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [industry, setIndustry] = useState(profile.industry ?? '');
  // Methods
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFromMethods(profile.paymentMethods));
  const [defaultType, setDefaultType] = useState(profile.defaultPaymentMethod);
  const [showAll, setShowAll] = useState(profile.showAllMethods !== false);
  const [methodErrors, setMethodErrors] = useState<Partial<Record<PaymentMethodType, string>>>({});
  // Reminders
  const [days, setDays] = useState((profile.reminderSchedule ?? [7, 14, 30]).join(', '));
  const [courtesy, setCourtesy] = useState(!!profile.courtesyNote);
  const [offerPlans, setOfferPlans] = useState(profile.offerPaymentPlans !== false);
  // Morning list
  const [morning, setMorning] = useState(profile.queue.morningTime);
  const [sendTime, setSendTime] = useState(profile.queue.sendTime);
  const [mode, setMode] = useState<QueueMode>(profile.queue.mode);
  const [tz, setTz] = useState(profile.timezone);
  // Wording
  const [kind, setKind] = useState<ReminderKind>('friendly');
  const [wording, setWording] = useState<Record<ReminderKind, ReminderWording>>(() => {
    const out = {} as Record<ReminderKind, ReminderWording>;
    for (const k of Object.keys(DEFAULT_WORDING) as ReminderKind[]) out[k] = { ...DEFAULT_WORDING[k], ...(profile.wording?.[k] ?? {}) };
    return out;
  });
  const [sms, setSms] = useState(false);

  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView();
  }, [loc.hash]);
  useEffect(() => {
    if (params.get('billing') === 'done') toast({ message: 'Thank you! Your plan will update in a moment.' });
  }, [params, toast]);

  const save = async (key: string, data: Record<string, unknown>, ok = 'Saved.') => {
    setSaving(key);
    try {
      await updateDoc(userRef, data);
      toast({ message: ok });
    } catch {
      toast({ message: 'We could not save that. Please try again.', error: true });
    } finally {
      setSaving(null);
    }
  };

  const zones = ZONES.includes(profile.timezone) ? ZONES : [profile.timezone, ...ZONES];
  const trialLeft = trialDaysLeft(profile.subscription);
  const sub = profile.subscription;

  return (
    <>
      <h1>Settings</h1>
      <nav aria-label="Settings sections" className="card tint">
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          <li><a href="#business">Your business</a></li>
          <li><a href="#methods">How you get paid</a></li>
          <li><a href="#reminders">When reminders go out</a></li>
          <li><a href="#morning">Your morning list</a></li>
          <li><a href="#wording">Reminder wording</a></li>
          <li><a href="#plan">Your plan</a></li>
        </ul>
      </nav>

      <Section id="business" title="Your business" saving={saving === 'business'} onSave={() => {
        if (!ownerName.trim() || !businessName.trim()) { toast({ message: 'Please fill in your name and business name.', error: true }); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())) { toast({ message: 'The reply email does not look right.', error: true }); return; }
        void save('business', { ownerName: ownerName.trim(), businessName: businessName.trim(), replyToEmail: replyTo.trim().toLowerCase(), phone: phone.trim() || null, industry: industry.trim() || null });
      }}>
        <Field label="Your name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        <Field label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        <Field label="Email for customer replies" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
        <Field label="Business phone (optional)" hint="Shown on the page customers see." type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Field label="What kind of business? (optional)" hint="Example: Plumbing. Helps us learn what works for businesses like yours." value={industry} onChange={(e) => setIndustry(e.target.value)} />
        <div className="field">
          <label htmlFor="logo-upload">Logo</label>
          {profile.logoUrl && <p><img src={profile.logoUrl} alt="Your current logo" style={{ maxHeight: 80 }} /></p>}
          <input id="logo-upload" type="file" accept="image/*" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) { toast({ message: 'Please pick a picture under 2 MB.', error: true }); return; }
            try {
              const path = `ezpayze/users/${uid}/logo/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_').slice(-60)}`;
              await uploadBytes(ref(storage, path), f, { contentType: f.type });
              await updateDoc(userRef, { logoPath: path, logoUrl: await getDownloadURL(ref(storage, path)) });
              toast({ message: 'Logo updated.' });
            } catch {
              toast({ message: 'We could not upload that picture.', error: true });
            }
          }} />
          {profile.logoUrl && <button type="button" className="btn plain" onClick={() => save('logo', { logoUrl: null, logoPath: null }, 'Logo removed.')}>Remove logo</button>}
        </div>
      </Section>

      <Section id="methods" title="How you get paid" saving={saving === 'methods'} onSave={() => {
        const res = methodsFromDrafts(drafts);
        if ('errors' in res) { setMethodErrors(res.errors); toast({ message: 'Please fix the highlighted spots.', error: true }); return; }
        setMethodErrors({});
        const def = res.methods.some((m) => m.type === defaultType) ? defaultType : res.methods[0].type;
        void save('methods', { paymentMethods: res.methods, defaultPaymentMethod: def, showAllMethods: showAll });
      }}>
        <MethodEditor drafts={drafts} onChange={(d) => { setDrafts(d); setMethodErrors({}); }} errors={methodErrors} defaultType={defaultType} onDefaultChange={setDefaultType} />
        <fieldset>
          <legend>In reminders, show</legend>
          <div className="tiles stack">
            {[{ v: true, l: 'Every way to pay (your first choice on top)' }, { v: false, l: 'Only your first choice' }].map((o) => (
              <div className="tile" key={String(o.v)}>
                <input type="radio" name="showall" id={`showall-${o.v}`} checked={showAll === o.v} onChange={() => setShowAll(o.v)} />
                <label htmlFor={`showall-${o.v}`}><span className="box" aria-hidden="true" />{o.l}</label>
              </div>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section id="reminders" title="When reminders go out" saving={saving === 'reminders'} onSave={() => {
        const parsed = cleanSchedule(days.split(/[^\d]+/).filter(Boolean).map(Number));
        setDays(parsed.join(', '));
        void save('reminders', { reminderSchedule: parsed, courtesyNote: courtesy, offerPaymentPlans: offerPlans });
      }}>
        <fieldset>
          <legend>Pick a schedule</legend>
          <div className="tiles stack">
            {SCHEDULE_PRESETS.map((p) => (
              <div className="tile" key={p.label}>
                <input type="radio" name="preset" id={`preset-${p.label}`} checked={cleanSchedule(days.split(/[^\d]+/).filter(Boolean).map(Number)).join(',') === p.days.join(',')} onChange={() => setDays(p.days.join(', '))} />
                <label htmlFor={`preset-${p.label}`}><span className="box" aria-hidden="true" /><span>{p.label}<span className="sub">{p.sub}</span></span></label>
              </div>
            ))}
          </div>
        </fieldset>
        <Field label="Or type your own (days late, up to 6)" hint="Example: 5, 15, 30" value={days} onChange={(e) => setDays(e.target.value)} />
        <p>Right now: reminders go out {describeSchedule(cleanSchedule(days.split(/[^\d]+/).filter(Boolean).map(Number)))}.</p>
        <div className="tiles stack" style={{ marginBottom: 22 }}>
          <div className="tile">
            <input type="checkbox" id="courtesy" checked={courtesy} onChange={(e) => setCourtesy(e.target.checked)} />
            <label htmlFor="courtesy"><span className="box" aria-hidden="true" /><span>Also send a heads-up on the due date<span className="sub">"Just a heads-up, this is due today."</span></span></label>
          </div>
          <div className="tile">
            <input type="checkbox" id="offerplans" checked={offerPlans} onChange={(e) => setOfferPlans(e.target.checked)} />
            <label htmlFor="offerplans"><span className="box" aria-hidden="true" /><span>Offer a payment plan in the final notice<span className="sub">Customers can ask to split the bill. You approve it. (Pro)</span></span></label>
          </div>
        </div>
      </Section>

      <Section id="morning" title="Your morning list" saving={saving === 'morning'} onSave={() => {
        if (sendTime <= morning) { toast({ message: 'Send time should be after the list is ready.', error: true }); return; }
        void save('morning', { queue: { morningTime: morning, sendTime, mode }, timezone: tz });
      }}>
        <Field label="Your list is ready at" hint="We email it to you too." type="time" step={900} value={morning} onChange={(e) => setMorning(e.target.value)} />
        <Field label="Reminders go out at" type="time" step={900} value={sendTime} onChange={(e) => setSendTime(e.target.value)} />
        <fieldset>
          <legend>How should sending work?</legend>
          <div className="tiles stack">
            <div className="tile">
              <input type="radio" name="mode" id="mode-auto" checked={mode === 'auto'} onChange={() => setMode('auto')} />
              <label htmlFor="mode-auto"><span className="box" aria-hidden="true" /><span>Send them unless I say someone paid<span className="sub">Recommended. Nothing to do on most days.</span></span></label>
            </div>
            <div className="tile">
              <input type="radio" name="mode" id="mode-approve" checked={mode === 'approve'} onChange={() => setMode('approve')} />
              <label htmlFor="mode-approve"><span className="box" aria-hidden="true" /><span>Only send the ones I OK<span className="sub">Nothing goes out until you approve it.</span></span></label>
            </div>
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="tz">Your time zone</label>
          <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => <option key={z} value={z}>{ZONE_NAMES[z] ? `${ZONE_NAMES[z]} time` : z}</option>)}
          </select>
        </div>
      </Section>

      <Section id="wording" title="Reminder wording">
        {!pro && <div className="card warn"><strong>Changing the wording is part of Pro.</strong> Your reminders use our friendly wording, shown below.</div>}
        <div className="field">
          <label htmlFor="kind">Which reminder?</label>
          <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as ReminderKind)}>
            {(Object.keys(KIND_LABELS) as ReminderKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const custom: Record<string, ReminderWording> = {};
          for (const k of Object.keys(wording) as ReminderKind[]) {
            if (wording[k].subject !== DEFAULT_WORDING[k].subject || wording[k].body !== DEFAULT_WORDING[k].body) custom[k] = { subject: wording[k].subject.slice(0, 150), body: wording[k].body.slice(0, 3000) };
          }
          void save('wording', { wording: custom });
        }}>
          <Field label="Subject line" value={wording[kind].subject} disabled={!pro} onChange={(e) => setWording({ ...wording, [kind]: { ...wording[kind], subject: e.target.value } })} />
          <div className="field">
            <label htmlFor="body">Message</label>
            <p className="hint" id="body-hint">These fill in by themselves: {PLACEHOLDERS.map((p) => `${p.key} (${p.meaning.toLowerCase()})`).join(', ')}.</p>
            <textarea id="body" aria-describedby="body-hint" disabled={!pro} value={wording[kind].body} onChange={(e) => setWording({ ...wording, [kind]: { ...wording[kind], body: e.target.value } })} />
          </div>
          {pro && (
            <div className="row-actions" style={{ marginBottom: 16 }}>
              <button type="submit" className="btn big" disabled={saving === 'wording'}>Save wording</button>
              <button type="button" className="btn secondary" onClick={() => setWording({ ...wording, [kind]: { ...DEFAULT_WORDING[kind] } })}>Use our wording for this one</button>
            </div>
          )}
        </form>
        <h3>Live preview</h3>
        <ReminderPreview
          user={{ ...profile, wording }}
          payment={samplePayment(kind === 'courtesy' ? today : addDays(today, -(kind === 'final' ? 30 : kind === 'firm' ? 14 : 7)))}
          kind={kind}
          today={today}
          allowCustom={pro}
        />
        <div className="row-actions">
          <button type="button" className="btn secondary" onClick={async () => {
            try {
              const r = await api.sendSample({ kind });
              toast({ message: `Sample sent to ${r.to}. (Uses your saved wording.)` });
            } catch (err) {
              toast({ message: errorText(err), error: true });
            }
          }}>Email me this sample</button>
        </div>
      </Section>

      <Section id="plan" title="Your plan">
        <p className="lead">
          {sub.status === 'trialing' && trialLeft !== null && trialLeft > 0
            ? <>You're trying <strong>Pro</strong> free: {trialLeft} day{trialLeft === 1 ? '' : 's'} left.</>
            : pro
              ? <>You're on <strong>Pro</strong>{sub.smsAddon ? ' with text messages' : ''}.{sub.currentPeriodEnd ? ` Renews ${longDate(new Date(sub.currentPeriodEnd).toISOString().slice(0, 10))}.` : ''}</>
              : <>You're on the <strong>Free</strong> plan: up to {FREE_OPEN_JOB_LIMIT} open jobs and email reminders.</>}
        </p>
        {sub.status === 'past_due' && <div className="card danger">Your last payment didn't go through. Please update your card below.</div>}
        <ul>
          <li><strong>Pro, {PRICES.proMonthly} or {PRICES.proYearly}:</strong> unlimited jobs, attachments, payment plans, the numbers page, and your own wording.</li>
          <li><strong>Text messages, {PRICES.smsAddon}:</strong> reminders by text too (up to 300 a month).</li>
        </ul>
        {(!pro || sub.status === 'trialing') && (
          <>
            <div className="tiles stack" style={{ marginBottom: 16 }}>
              <div className="tile">
                <input type="checkbox" id="sms" checked={sms} onChange={(e) => setSms(e.target.checked)} />
                <label htmlFor="sms"><span className="box" aria-hidden="true" />Add text messages ({PRICES.smsAddon})</label>
              </div>
            </div>
            <div className="row-actions">
              {(['month', 'year'] as const).map((interval) => (
                <button key={interval} type="button" className="btn big" onClick={async () => {
                  try {
                    const { url } = await api.createCheckout({ interval, sms });
                    window.location.assign(url);
                  } catch (err) {
                    toast({ message: errorText(err), error: true });
                  }
                }}>
                  Get Pro, {interval === 'month' ? PRICES.proMonthly : PRICES.proYearly}
                </button>
              ))}
            </div>
          </>
        )}
        {sub.stripeCustomerId && (
          <button type="button" className="btn secondary" style={{ marginTop: 12 }} onClick={async () => {
            try {
              window.location.assign((await api.billingPortal({})).url);
            } catch (err) {
              toast({ message: errorText(err), error: true });
            }
          }}>Change plan, card, or cancel</button>
        )}
        <p className="hint" style={{ marginTop: 16 }}>This is the only money EzPayze ever handles. Your customers always pay you directly.</p>
      </Section>

      <section className="card">
        <h2>Signed in as {profile.email}</h2>
        <button type="button" className="btn secondary" onClick={() => void signOut()}>Sign out</button>
      </section>
    </>
  );
}
