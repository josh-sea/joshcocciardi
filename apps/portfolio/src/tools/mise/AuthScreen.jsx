import React, { useState } from "react";
import {
  authMessage,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "./auth";

/* Sign in / create account / reset password. Google and email+password are the
   two providers enabled on the Firebase project. */
export default function AuthScreen() {
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
    if (mode === "reset") {
      return run(async () => {
        await resetPassword(email.trim());
        setNotice("Password reset sent. Check your email, then sign in.");
        setMode("in");
      });
    }
    if (mode === "up") {
      return run(() => signUpWithEmail(email.trim(), password, name.trim()));
    }
    return run(() => signInWithEmail(email.trim(), password));
  };

  const heading =
    mode === "up" ? "Create an account" : mode === "reset" ? "Reset your password" : "Sign in";

  return (
    <div className="gate">
      <div className="sheet">
        <span className="word">Mise</span>
        <div className="tagline">Everything flows right.</div>
        <div className="sub">
          A convergence chart for implementation work. Sign in to keep your plans.
        </div>

        <button
          className="btn ghost"
          type="button"
          disabled={busy}
          onClick={() => run(signInWithGoogle)}
          style={{ marginTop: 18 }}
        >
          Continue with Google
        </button>

        <div className="rule">or</div>

        <form onSubmit={submit}>
          {mode === "up" && (
            <label className="field">
              <span className="flabel">Name</span>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              />
            </label>
          )}

          <button className="btn" type="submit" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "up"
              ? "Create account"
              : mode === "reset"
              ? "Send reset email"
              : "Sign in"}
          </button>
        </form>

        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}

        <div className="foot">
          {mode === "in" ? (
            <>
              <button className="linkish" type="button" onClick={() => setMode("up")}>
                Create an account
              </button>
              <button className="linkish" type="button" onClick={() => setMode("reset")}>
                Forgot password
              </button>
            </>
          ) : (
            <button className="linkish" type="button" onClick={() => setMode("in")}>
              ◂ Back to sign in
            </button>
          )}
        </div>

        <div className="sub" style={{ marginTop: 16, lineHeight: 1.6 }}>
          {heading === "Sign in" ? "" : `${heading}. `}
          Your plans are private to your account.
        </div>
      </div>
    </div>
  );
}
