import React, { useEffect, useRef, useState } from "react";
import {
  authMessage,
  refreshVerified,
  resetPassword,
  sendVerification,
  signInWithEmail,
  signInWithGoogle,
  signOutOfReadingBuddy,
  signUpWithEmail,
} from "./auth";

// Where the verification link brings people back to.
const here = () => `${window.location.origin}/tools/myreadingbuddy`;

/* The way in: Google, or any email address (Yahoo, iCloud, work, anything)
   with a password. */
export function SignIn() {
  const [mode, setMode] = useState("in"); // in | up | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    const addr = email.trim();
    if (mode === "reset") {
      return run(async () => {
        await resetPassword(addr);
        setNotice(`If ${addr} has an account, a reset link is on its way. Check your email, then sign in.`);
        setMode("in");
      });
    }
    if (mode === "up") {
      return run(async () => {
        await signUpWithEmail(addr, password, name.trim());
        // Best effort: the verify screen that follows has a resend button.
        await sendVerification(here()).catch((err) => console.warn("[readingbuddy] verification email", err?.code));
      });
    }
    return run(() => signInWithEmail(addr, password));
  };

  const pick = (m) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="gate">
      <div className="card form gatecard">
        <div className="logo" aria-hidden="true">
          📖
        </div>
        <h1 className="h1">My Reading Buddy</h1>
        <p className="muted">
          Snap the pages of a favorite book, read it aloud, and the kids can hear you read it any time, even when
          you're away.
        </p>

        <button className="btn wide" type="button" disabled={busy} onClick={() => run(signInWithGoogle)}>
          Continue with Google
        </button>

        <div className="rule">or use any email</div>

        <form onSubmit={submit} className="authform">
          {mode === "up" && (
            <label className="field">
              <span className="flabel">Your name</span>
              <input
                className="input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </label>
          )}
          <label className="field">
            <span className="flabel">Email</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yahoo.com"
            />
          </label>
          {mode !== "reset" && (
            <label className="field">
              <span className="flabel">Password</span>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "up" ? "At least 6 characters" : ""}
              />
            </label>
          )}
          <button className="btn ghost wide" type="submit" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "up"
              ? "Create account"
              : mode === "reset"
              ? "Send reset link"
              : "Sign in with email"}
          </button>
        </form>

        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}

        <div className="authfoot">
          {mode === "in" ? (
            <>
              <button className="linkish" type="button" onClick={() => pick("up")}>
                New here? Create an account
              </button>
              <button className="linkish" type="button" onClick={() => pick("reset")}>
                Forgot password
              </button>
            </>
          ) : (
            <button className="linkish" type="button" onClick={() => pick("in")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* An email account that hasn't clicked its link yet. Bookshelves are
   shared by email address, so the address has to be proven first; that is
   what stops someone signing up as another person's email to see their
   books. Checks again whenever the tab comes back into view, since the link
   is usually opened in another tab or on a phone. */
export function VerifyEmail({ user, onVerified }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const checking = useRef(false);

  const check = async (quiet) => {
    if (checking.current) return;
    checking.current = true;
    if (!quiet) {
      setBusy(true);
      setError(null);
      setNotice(null);
    }
    try {
      if (await refreshVerified()) onVerified();
      else if (!quiet) setNotice("Not verified yet. Click the link in the email, then try again.");
    } catch (e) {
      if (!quiet) setError(authMessage(e));
    } finally {
      checking.current = false;
      if (!quiet) setBusy(false);
    }
  };

  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    const onBack = () => document.visibilityState === "visible" && checkRef.current(true);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, []);

  const resend = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendVerification(here());
      setNotice(`Sent again to ${user.email}. It can take a minute, and check the spam folder too.`);
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="card form gatecard">
        <div className="logo" aria-hidden="true">
          ✉️
        </div>
        <h2 className="h2">Check your email</h2>
        <p className="muted">
          We sent a link to <strong>{user.email}</strong>. Click it to confirm the address, then come back here.
        </p>
        <button className="btn wide" type="button" disabled={busy} onClick={() => check(false)}>
          {busy ? "Checking…" : "I clicked the link"}
        </button>
        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}
        <div className="authfoot">
          <button className="linkish" type="button" disabled={busy} onClick={resend}>
            Send the email again
          </button>
          <button className="linkish" type="button" onClick={signOutOfReadingBuddy}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
