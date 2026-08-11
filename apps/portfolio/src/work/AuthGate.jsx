import React, { useEffect, useState } from "react";
import { isAllowed } from "./access";
import { authMessage, signInWithGoogle, signOutOfWork, watchAuth } from "./auth";

/* Sign-in wall for every /work page. Three terminal states:
   - resolving  → nothing rendered but a quiet placeholder
   - signed out → "Continue with Google"
   - signed in  → children, but only if the address is on the allowlist */

const shell = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0f1115",
  color: "#e6e8ee",
  fontFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif",
  padding: 24,
  boxSizing: "border-box",
};

const sheet = {
  width: "100%",
  maxWidth: 380,
  background: "#171a21",
  border: "1px solid #262b36",
  borderRadius: 16,
  padding: "30px 28px",
  textAlign: "center",
};

const button = {
  width: "100%",
  marginTop: 22,
  border: "1px solid #333a49",
  background: "#fff",
  color: "#101828",
  borderRadius: 10,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const linkish = {
  border: "none",
  background: "transparent",
  color: "#8f9bb3",
  fontSize: 12.5,
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
  marginTop: 18,
};

export default function AuthGate({ title, children }) {
  const [user, setUser] = useState(undefined); // undefined = still resolving
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => watchAuth((u) => setUser(u || null)), []);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (user === undefined) {
    return (
      <div style={shell}>
        <div style={{ color: "#8f9bb3", fontSize: 13 }}>Checking access…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={shell}>
        <div style={sheet}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>{title}</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#8f9bb3", lineHeight: 1.6 }}>
            This is a private page. Sign in with the account it belongs to.
          </div>
          <button style={button} type="button" disabled={busy} onClick={signIn}>
            {busy ? "Working…" : "Continue with Google"}
          </button>
          {error && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: "#ff8b7d" }}>{error}</div>
          )}
        </div>
      </div>
    );
  }

  if (!isAllowed(user)) {
    return (
      <div style={shell}>
        <div style={sheet}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>No access</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#8f9bb3", lineHeight: 1.6 }}>
            <strong style={{ color: "#e6e8ee" }}>{user.email}</strong> isn't allowed on this page.
            If you have another account, sign out and try that one.
          </div>
          <button style={linkish} type="button" onClick={signOutOfWork}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return children(user);
}
