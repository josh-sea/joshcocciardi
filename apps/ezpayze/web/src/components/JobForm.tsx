// Add a job that's done and owed. Used on the Add job page and in setup.

import { useId, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { FREE_OPEN_JOB_LIMIT, isPro } from '@shared/billing';
import { addDays, longDate } from '@shared/dates';
import { parseMoney, formatMoney } from '@shared/money';
import type { Customer, EzUser, Job } from '@shared/types';
import { db, storage, USERS } from '../lib/firebase';
import { useCustomers, useJobs } from '../lib/data';
import { newId, ownerToday } from '../lib/format';
import { Field, MoneyField } from './Field';

const MAX_FILE = 10 * 1024 * 1024;

export function JobForm({ uid, profile, onDone, submitLabel = 'Save job' }: {
  uid: string;
  profile: EzUser;
  onDone: (jobId: string) => void;
  submitLabel?: string;
}) {
  const base = useId();
  const today = ownerToday(profile);
  const { items: customers } = useCustomers(uid);
  const { items: jobs } = useJobs(uid);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(today);
  const [ref_, setRef] = useState('');
  const [category, setCategory] = useState('');
  const [completed, setCompleted] = useState(today);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pro = isPro(profile.subscription);
  const openJobs = jobs.filter((j) => j.status === 'open' && !j.limitBlocked).length;
  const overLimit = !pro && openJobs >= FREE_OPEN_JOB_LIMIT;
  const categories = useMemo(() => [...new Set(jobs.map((j) => j.category).filter(Boolean) as string[])], [jobs]);

  const pickCustomer = (value: string) => {
    setName(value);
    const match = customers.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      if (!email && match.email) setEmail(match.email);
      if (!phone && match.phone) setPhone(match.phone);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailed(null);
    const errs: Record<string, string> = {};
    const cents = parseMoney(amount);
    if (!name.trim()) errs.name = 'Who owes you for this job?';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'That email address does not look right.';
    if (!title.trim()) errs.title = 'What was the job? A few words is fine.';
    if (!cents) errs.amount = 'How much do they owe? Like 450 or 1,250.00';
    if (!due) errs.due = 'When is it due?';
    if (files.some((f) => f.size > MAX_FILE)) errs.files = 'Each file must be under 10 MB.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`${base}-${first}`)?.focus();
      return;
    }

    setBusy(true);
    try {
      const custName = name.trim();
      const custEmail = email.trim().toLowerCase() || null;
      const custPhone = phone.trim() || null;
      let customer = customers.find((c) => c.name.toLowerCase() === custName.toLowerCase() && (!custEmail || !c.email || c.email === custEmail));
      const customerId = customer?.id ?? newId();
      if (!customer || customer.email !== custEmail || customer.phone !== custPhone) {
        const data: Customer = { name: custName, email: custEmail ?? customer?.email ?? null, phone: custPhone ?? customer?.phone ?? null, createdAt: Date.now() };
        await setDoc(doc(db, USERS, uid, 'customers', customerId), data);
        customer = { id: customerId, ...data };
      }

      const jobId = newId();
      const attachments: string[] = [];
      for (const f of files) {
        const safe = f.name.replace(/[^\w.-]+/g, '_').slice(-80);
        const path = `ezpayze/users/${uid}/jobs/${jobId}/${Date.now()}-${safe}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type || 'application/pdf' });
        attachments.push(path);
      }

      const job: Job = {
        customerId,
        customerName: custName,
        customerEmail: custEmail,
        customerPhone: custPhone,
        title: title.trim().slice(0, 120),
        referenceNumber: ref_.trim() || null,
        category: category.trim() || null,
        totalAmount: cents!,
        currency: 'USD',
        completedDate: completed || null,
        dueDate: due,
        attachments,
        hasPlan: false,
        status: 'open',
        createdAt: Date.now(),
        source: 'manual',
      };
      await setDoc(doc(db, USERS, uid, 'jobs', jobId), job);
      onDone(jobId);
    } catch {
      setFailed('We could not save this job. Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const id = (k: string) => `${base}-${k}`;
  return (
    <form onSubmit={submit} noValidate>
      {overLimit && (
        <div className="card warn">
          <p><strong>Free accounts send reminders for {FREE_OPEN_JOB_LIMIT} jobs at a time.</strong> You can still save this job, but its reminders stay off until one of the others is paid or you <a href="/settings#plan">upgrade to Pro</a>.</p>
        </div>
      )}

      <h2>Who owes you?</h2>
      <Field id={id('name')} label="Customer name" list={`${base}-customers`} autoComplete="off" value={name} onChange={(e) => pickCustomer(e.target.value)} error={errors.name} />
      <datalist id={`${base}-customers`}>
        {customers.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
      <Field id={id('email')} label="Their email address" hint="Reminders are sent here. You can add it later." type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <Field id={id('phone')} label="Their cell phone (optional)" hint="Only used if you have the text message add-on." type="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <h2>What for?</h2>
      <Field id={id('title')} label="What was the job?" hint="Example: Kitchen cabinet install" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={120} />
      <MoneyField id={id('amount')} label="How much do they owe?" value={amount} onChange={setAmount} error={errors.amount} />
      {parseMoney(amount) ? <p className="hint" aria-live="polite">That's {formatMoney(parseMoney(amount)!)}.</p> : null}

      <Field id={id('due')} label="When is it due?" type="date" value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} hint={due ? `Due ${longDate(due)}.` : undefined} />
      <div className="row-actions" style={{ marginTop: -8, marginBottom: 22 }}>
        <button type="button" className="btn secondary" aria-pressed={due === today} onClick={() => setDue(today)}>Today</button>
        <button type="button" className="btn secondary" aria-pressed={due === addDays(today, 14)} onClick={() => setDue(addDays(today, 14))}>In 2 weeks</button>
        <button type="button" className="btn secondary" aria-pressed={due === addDays(today, 30)} onClick={() => setDue(addDays(today, 30))}>In 30 days</button>
      </div>

      <details className="help" style={{ marginBottom: 22 }}>
        <summary>More details (optional): invoice, reference number, type of work</summary>
        <div style={{ paddingTop: 12 }}>
          <div className="field">
            <label htmlFor={id('files')}>Attach the invoice or quote</label>
            <p className="hint" id={`${id('files')}-hint`}>A PDF, or a photo of a paper invoice. 10 MB or less each.{!pro && ' Attachments go out with reminders on Pro.'}</p>
            <input id={id('files')} type="file" accept="application/pdf,image/*" multiple aria-describedby={`${id('files')}-hint`} onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
            {errors.files && <p className="error-text">{errors.files}</p>}
          </div>
          <Field id={id('ref')} label="Your invoice or order number" value={ref_} onChange={(e) => setRef(e.target.value)} maxLength={60} />
          <Field id={id('category')} label="Type of work" hint="Helps your numbers page. Example: Repairs" list={`${base}-cats`} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
          <datalist id={`${base}-cats`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Field id={id('completed')} label="Date the job was finished" type="date" value={completed} max={today} onChange={(e) => setCompleted(e.target.value)} />
        </div>
      </details>

      {failed && <p className="error-text" role="alert">{failed}</p>}
      <button className="btn big block" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
