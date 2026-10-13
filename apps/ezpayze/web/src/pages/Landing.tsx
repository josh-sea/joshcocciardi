import { Link, Navigate } from 'react-router-dom';
import { PRICES } from '@shared/billing';
import { useAuth } from '../lib/auth';

export function Landing() {
  const { user, profile, loading } = useAuth();
  if (!loading && user && profile?.onboardingComplete) return <Navigate to="/today" replace />;
  const cta = user ? '/setup' : '/signin';
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="hero">
        <div className="inner">
          <p style={{ fontWeight: 800, letterSpacing: '0.05em' }}>EZPAYZE</p>
          <h1>Stop chasing payments.</h1>
          <p>EzPayze sends friendly reminders until your customers pay you. Made for small businesses. Set up in five minutes.</p>
          <Link className="btn big" to={cta}>{user ? 'Finish setting up' : 'Start free'}</Link>
          {!user && <p style={{ marginTop: 16, fontSize: '1.05rem' }}>Already using EzPayze? <Link to="/signin" style={{ color: '#fff' }}>Sign in</Link></p>}
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <h2>How it works</h2>
        <ol className="steps">
          <li><strong>Tell us how you like to get paid.</strong> Venmo, Zelle, Cash App, check, cash, or a card link.</li>
          <li><strong>Add a job that's done.</strong> Who owes you, how much, and when it's due. Attach the invoice if you have one.</li>
          <li><strong>Check your list each morning.</strong> Tap "Got paid" for anyone who already paid. We send polite reminders to the rest.</li>
        </ol>

        <h2>Friendly, never pushy</h2>
        <p>Reminders go out 7, 14, and 30 days late (you can change that). They're warm and personal, signed with your name, and replies come straight to you. The last one offers to split the bill into payments if that helps.</p>

        <h2>Your money goes straight to you</h2>
        <p>EzPayze never touches your customers' payments. They pay you directly, the same way they do now. We just do the remembering and the asking.</p>

        <h2>Simple pricing</h2>
        <div className="price-grid">
          <div className="card"><h3>Free</h3><p className="lead"><strong>$0</strong></p><p>Up to 3 open jobs, email reminders, and the morning list.</p></div>
          <div className="card"><h3>Pro</h3><p className="lead"><strong>{PRICES.proMonthly}</strong> or {PRICES.proYearly}</p><p>Unlimited jobs, attached invoices, payment plans, your numbers, and your own wording.</p></div>
          <div className="card"><h3>Text messages</h3><p className="lead"><strong>{PRICES.smsAddon}</strong></p><p>Add text reminders to Pro.</p></div>
        </div>
        <p>Every account starts with 14 days of Pro, free. No card needed.</p>
        <Link className="btn big block" to={cta}>{user ? 'Finish setting up' : 'Start free'}</Link>
      </main>
      <footer className="site">EzPayze is a reminder service. It never holds or moves money.</footer>
    </div>
  );
}
