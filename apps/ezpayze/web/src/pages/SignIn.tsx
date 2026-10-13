// Sign in without a password: a link by email, or Google.
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Field } from '../components/Field';

const EMAIL_KEY = 'ezpayze.signinEmail';
const NEXT_KEY = 'ezpayze.signinNext';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/today';
}

function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code.includes('invalid-email')) return 'That email address does not look right.';
  if (code.includes('popup-closed')) return 'The Google window was closed. Please try again.';
  if (code.includes('unauthorized-domain') || code.includes('operation-not-allowed')) return 'Sign-in is not switched on for this site yet. Please try again later.';
  if (code.includes('expired') || code.includes('invalid-action')) return 'That sign-in link has expired. Ask for a new one below.';
  return 'Something went wrong. Please try again.';
}

export function SignIn() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) return <Navigate to={next} replace />;

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError('Please type your email address, like name@example.com');
      return;
    }
    setBusy(true);
    try {
      await sendSignInLinkToEmail(auth, addr, { url: `${window.location.origin}/signin/finish`, handleCodeInApp: true });
      localStorage.setItem(EMAIL_KEY, addr);
      localStorage.setItem(NEXT_KEY, next);
      setSent(true);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(friendly(err));
    }
  };

  return (
    <main id="main" tabIndex={-1}>
      <p><a href="/">EzPayze</a></p>
      <h1>Sign in to EzPayze</h1>
      {sent ? (
        <div className="card good" role="status">
          <h2>Check your email</h2>
          <p className="lead">We sent a sign-in link to <strong>{email}</strong>. Open it on this device and you're in.</p>
          <p>No email after a minute? Look in your spam folder, or <button type="button" className="btn plain" onClick={() => setSent(false)}>try again</button>.</p>
        </div>
      ) : (
        <>
          <p className="lead">No password needed. We'll email you a link.</p>
          <form onSubmit={sendLink} noValidate>
            <Field label="Your email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
            <button className="btn big block" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
          <p className="center" style={{ margin: '24px 0' }}><strong>or</strong></p>
          <button className="btn secondary big block" type="button" onClick={google}>Sign in with Google</button>
        </>
      )}
    </main>
  );
}

export function FinishSignIn() {
  const navigate = useNavigate();
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const finish = async (addr: string) => {
    try {
      await signInWithEmailLink(auth, addr, window.location.href);
      localStorage.removeItem(EMAIL_KEY);
      const next = safeNext(localStorage.getItem(NEXT_KEY));
      localStorage.removeItem(NEXT_KEY);
      navigate(next, { replace: true });
    } catch (err) {
      setError(friendly(err));
      setNeedEmail(true);
    }
  };

  useEffect(() => {
    // A sign-in link works once; don't spend it twice (React dev re-runs effects).
    if (started.current) return;
    started.current = true;
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      navigate('/signin', { replace: true });
      return;
    }
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) void finish(saved);
    else setNeedEmail(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main id="main" tabIndex={-1}>
      <h1>Signing you in…</h1>
      {needEmail && (
        <form onSubmit={(e) => { e.preventDefault(); void finish(email.trim()); }}>
          <p className="lead">To finish, type the email address you asked us to send the link to.</p>
          <Field label="Your email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <button className="btn big block" type="submit">Finish signing in</button>
          <p style={{ marginTop: 20 }}><a href="/signin">Get a new link</a></p>
        </form>
      )}
    </main>
  );
}
