// The page a customer sees from a reminder. No login: the link's signed token
// names one bill. Shows how to pay (money goes straight to the business) and,
// when offered, lets them ask to split it into payments.

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { addDays, longDate } from '@shared/dates';
import { methodInfo } from '@shared/methods';
import { formatMoney } from '@shared/money';
import { describePlan, nextFirstOfMonth, planDates, splitAmount } from '@shared/plan';
import type { CheckDetails, PaymentMethod } from '@shared/types';
import { api, errorText, type PayPageData } from '../../lib/api';

function sample(today: string): PayPageData {
  return {
    businessName: 'Your business', ownerName: 'You', logoUrl: null, replyToEmail: 'you@example.com', phone: null,
    customerName: 'Jane Miller', jobTitle: 'Kitchen cabinet install', referenceNumber: '1042', amount: 125000,
    dueDate: addDays(today, -30), installment: null, status: 'open',
    methods: [{ type: 'venmo', label: 'Venmo', value: 'https://venmo.com/' }, { type: 'check', label: 'Check', value: { payableTo: 'Your business', address: '12 Main St, Springfield' } }],
    planOptions: [2, 3, 4, 6], planRequest: null, today,
  };
}

function Method({ m }: { m: PaymentMethod }) {
  const info = methodInfo(m.type);
  if (info.kind === 'link') {
    return <a className="btn big block" href={m.value as string} target="_blank" rel="noreferrer">Pay with {m.label} <span className="sr-only">(opens a new tab)</span></a>;
  }
  if (info.kind === 'check') {
    const c = m.value as CheckDetails;
    return (
      <div className="card">
        <h3>Pay by check</h3>
        <p style={{ margin: 0 }}>Make it out to: <strong>{c.payableTo}</strong></p>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>Mail to: <strong>{c.address}</strong></p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>{m.label}</h3>
      <p style={{ margin: 0 }}>{m.value as string}</p>
    </div>
  );
}

export function PayPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<PayPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const planRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = 'Your bill';
    if (token === 'sample') {
      setData(sample(new Date().toISOString().slice(0, 10)));
      return;
    }
    api.payPage({ token }).then(setData).catch((err) => setError(errorText(err)));
  }, [token]);

  useEffect(() => {
    if (data && params.get('plan') === '1' && data.planOptions.length) planRef.current?.focus();
  }, [data, params]);

  if (error) {
    return (
      <main id="main" tabIndex={-1}>
        <h1>We couldn't open this bill</h1>
        <p className="lead">{error}</p>
      </main>
    );
  }
  if (!data) return <main id="main"><p className="spinner" role="status">Loading your bill…</p></main>;

  const first = data.customerName.split(' ')[0];
  const firstDue = nextFirstOfMonth(data.today);

  return (
    <main id="main" tabIndex={-1}>
      <header style={{ marginBottom: 20 }}>
        {data.logoUrl ? <img src={data.logoUrl} alt={data.businessName} style={{ maxHeight: 80, maxWidth: 260 }} /> : <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{data.businessName}</p>}
      </header>
      {token === 'sample' && <div className="card warn">This is a sample. Your customers see their own bill here.</div>}
      <h1>Hi {first}, here's your bill</h1>

      <div className="card tint">
        <p style={{ margin: 0 }}>For: <strong>{data.jobTitle}{data.installment ? ` (payment ${data.installment.number} of ${data.installment.of})` : ''}</strong></p>
        {data.referenceNumber && <p style={{ margin: 0 }}>Reference: <strong>{data.referenceNumber}</strong></p>}
        <p style={{ margin: 0 }}>Due: <strong>{longDate(data.dueDate)}</strong></p>
        <p style={{ margin: '8px 0 0', fontSize: '1.6rem', fontWeight: 800 }}>{formatMoney(data.amount)}</p>
      </div>

      {data.status === 'paid' ? (
        <div className="card good"><h2>This is paid. Thank you!</h2></div>
      ) : data.status === 'canceled' ? (
        <div className="card tint"><h2>Nothing is owed on this bill.</h2></div>
      ) : (
        <>
          <h2>Ways to pay</h2>
          <p>Your payment goes straight to {data.businessName}.</p>
          <div className="stack">{data.methods.map((m) => <Method key={m.type} m={m} />)}</div>
        </>
      )}

      {data.planRequest && (
        <div className="card good" role="status" style={{ marginTop: 24 }}>
          {data.planRequest.status === 'pending' && <p style={{ margin: 0 }}>You asked to pay in {data.planRequest.count} payments. {data.businessName} will get back to you soon.</p>}
          {data.planRequest.status === 'approved' && <p style={{ margin: 0 }}>Your payment plan is set. Check your email for the dates.</p>}
          {data.planRequest.status === 'declined' && <p style={{ margin: 0 }}>Please reply to the email to talk about payment options.</p>}
        </div>
      )}

      {data.planOptions.length > 0 && !requested && data.status === 'open' && (
        <section style={{ marginTop: 28 }} aria-labelledby="plan-h">
          <h2 id="plan-h" tabIndex={-1} ref={planRef}>Need to split this up?</h2>
          <p>Pick what works for you and {data.businessName} will look at it.</p>
          <fieldset>
            <legend className="sr-only">How many payments</legend>
            <div className="tiles stack">
              {data.planOptions.map((n) => {
                const amounts = splitAmount(data.amount, n);
                const dates = planDates({ count: n, frequency: 'monthly_first', startDate: data.today });
                const text = describePlan(dates.map((d, i) => ({ number: i + 1, of: n, amount: amounts[i], dueDate: d })), data.today);
                return (
                  <div className="tile" key={n}>
                    <input type="radio" name="count" id={`n-${n}`} checked={count === n} onChange={() => setCount(n)} />
                    <label htmlFor={`n-${n}`}><span className="box" aria-hidden="true" /><span>{n} monthly payments<span className="sub">{text}</span></span></label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="note">Anything you want them to know? (optional)</label>
            <textarea id="note" maxLength={500} style={{ minHeight: 110 }} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="hint">First payment would be due {longDate(firstDue)}. Dates may change when they approve it.</p>
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn big block" disabled={!count || busy} onClick={async () => {
            if (!count) return;
            if (token === 'sample') { setRequested(true); return; }
            setBusy(true);
            try {
              await api.requestPlan({ token, count, note });
              setRequested(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}>{busy ? 'Sending…' : 'Ask for this payment plan'}</button>
        </section>
      )}
      {requested && <div className="card good" role="status" style={{ marginTop: 24 }}><strong>Sent!</strong> {data.businessName} will get back to you soon.</div>}

      <section style={{ marginTop: 28 }}>
        <h2>Questions?</h2>
        <p>Email <a href={`mailto:${data.replyToEmail}`}>{data.replyToEmail}</a>{data.phone && <> or call <a href={`tel:${data.phone}`}>{data.phone}</a></>}.</p>
      </section>
      <footer className="site" style={{ marginTop: 32 }}>
        Reminders sent for {data.businessName} by EzPayze. EzPayze never handles your payment.
      </footer>
    </main>
  );
}
