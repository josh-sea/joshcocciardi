import React, { useState } from "react";
import { createHousehold, normEmail, saveMembers } from "./store";

const splitEmails = (s) =>
  String(s || "")
    .split(/[\s,;]+/)
    .map(normEmail)
    .filter(Boolean);

/* First run: nobody has added this email to a kitchen yet, so offer to start
   one. Whoever else should see the same plan goes in by email now or later. */
export function HouseholdSetup({ user, onError }) {
  const [name, setName] = useState("The Cocciardi Kitchen");
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await createHousehold(user, { name, otherEmails: splitEmails(others) });
    } catch (err) {
      onError(err);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h2 className="h2">Start your kitchen</h2>
        <p className="muted">
          Recipes, the weekly plan, and inventory all live in one shared kitchen. Anyone whose email is on it signs in
          with Google and sees the same thing.
        </p>
        <p className="muted small">
          Nobody has added <strong>{user.email}</strong> to a kitchen yet. If someone already started one, ask them to
          add this email under Members, then reload.
        </p>
        <label className="field">
          <span className="flabel">Kitchen name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="flabel">Also share with (emails)</span>
          <input
            className="input"
            type="text"
            inputMode="email"
            autoCapitalize="off"
            value={others}
            onChange={(e) => setOthers(e.target.value)}
            placeholder="partner@gmail.com"
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Starting…" : "Start the kitchen"}
        </button>
      </form>
    </div>
  );
}

/* Who can see this kitchen. Anyone on the list can add or remove anyone
   else, except themselves: the rules refuse a save that drops the person
   making it. */
export function Members({ household, user, onError, onClose }) {
  const me = normEmail(user.email);
  const [list, setList] = useState(household.memberEmails);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const persist = async (next) => {
    setBusy(true);
    try {
      await saveMembers(household.id, next);
      setList(next);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    const fresh = splitEmails(draft).filter((x) => !list.includes(x));
    if (!fresh.length) return;
    setDraft("");
    persist([...list, ...fresh]);
  };

  return (
    <div className="page narrow">
      <div className="card form">
        <div className="pagehead" style={{ marginBottom: 4 }}>
          <h2 className="h2">Members</h2>
          <button className="linkish" type="button" onClick={onClose}>
            done
          </button>
        </div>
        <p className="muted small">
          Everyone here signs in with Google using the email shown and sees the same recipes, plan, and inventory.
        </p>
        <div className="list">
          {list.map((email) => (
            <div key={email} className="item">
              <span>
                {email}
                {email === me && <span className="muted small"> (you)</span>}
              </span>
              {email !== me && (
                <button
                  className="iconbtn"
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${email}`}
                  onClick={() => window.confirm(`Remove ${email}?`) && persist(list.filter((x) => x !== email))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={add} className="row gap" style={{ marginTop: 12 }}>
          <input
            className="input"
            type="text"
            inputMode="email"
            autoCapitalize="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an email"
          />
          <button className="btn small" type="submit" disabled={busy || !draft.trim()}>
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
