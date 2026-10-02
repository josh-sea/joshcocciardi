import React, { createContext, useContext, useEffect, useState } from "react";
import { BRIEF_LABELS } from "./seed";
import { imageUrl } from "./store";

// Everything the pages share: live Firestore data plus navigation. Provided
// once by index.jsx so no page opens its own copy of a listener.
export const HQ = createContext(null);
export const useHQ = () => useContext(HQ);

export const LEVEL_TEXT = { red: "Red · review", yellow: "Yellow · one tap", green: "Green · auto" };

export const LevelChip = ({ level }) => <span className={`sb-chip ${level}`}>{LEVEL_TEXT[level] || level}</span>;

const RUN_TONE = {
  queued: "",
  running: "green",
  awaiting_approval: "yellow",
  completed: "pine",
  failed: "red",
  budget_paused: "clay",
  cancelled: "",
};
const RUN_TEXT = {
  queued: "Queued",
  running: "Running",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  failed: "Failed",
  budget_paused: "Budget paused",
  cancelled: "Cancelled",
};
export const RunStatus = ({ status }) => (
  <span className={`sb-chip ${RUN_TONE[status] || ""}`}>
    {status === "running" && <span className="sb-dot live" />}
    {RUN_TEXT[status] || status}
  </span>
);

const BRIEF_TONE = { pending: "yellow", approved: "green", rejected: "red", accepted: "green" };
export const BriefStatus = ({ status }) => <span className={`sb-chip ${BRIEF_TONE[status] || ""}`}>{status}</span>;

export const briefLabel = (type) => BRIEF_LABELS[type] || type;

export const Meter = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const cls = pct >= 100 ? "over" : pct >= 80 ? "warn" : "";
  return (
    <div className={`sb-meter ${cls}`} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
};

export const Field = ({ label, children, hint }) => (
  <label className="sb-field">
    <span>{label}</span>
    {children}
    {hint && <div className="sb-faint sb-small" style={{ marginTop: 3 }}>{hint}</div>}
  </label>
);

export const Modal = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sb-modal-back" onClick={onClose} role="presentation">
      <div className="sb-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sb-between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 20 }}>{title}</h2>
          <button className="sb-btn ghost sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* An image an agent saved to Storage (or a plain URL). Resolves the
   download URL lazily; shows a quiet placeholder until then. */
export const StoredImage = ({ path, alt }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    imageUrl(path).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [path]);
  if (!src) return <div className="ph" aria-hidden="true" />;
  return <img src={src} alt={alt || ""} loading="lazy" referrerPolicy="no-referrer" />;
};

export const explain = (e) =>
  e?.code === "permission-denied"
    ? "Firestore rules blocked that. If this is the first run, deploy the rules (./deploy.sh seasonal-box) and reload."
    : e?.message || String(e);

/* Small async-button helper: busy state and an error string per action. */
export const useAction = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(explain(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
};
