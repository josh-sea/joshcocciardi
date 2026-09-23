import React, { useEffect, useState } from "react";
import { createHousehold, normEmail, saveKitchen, saveMembers } from "./store";
import { makePeople, splitItems } from "./plan";

const splitEmails = (s) =>
  String(s || "")
    .split(/[\s,;]+/)
    .map(normEmail)
    .filter(Boolean);

/* First run: nobody has added this email to a kitchen yet, so offer to start
   one. Names the kitchen and the people eating from it; anyone else who
   should see the same plan goes in by email now or later. */
export function HouseholdSetup({ user, onError }) {
  const [name, setName] = useState("");
  const [who, setWho] = useState("");
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);
  const names = splitItems(who);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !names.length) return;
    setBusy(true);
    try {
      await createHousehold(user, {
        name,
        otherEmails: splitEmails(others),
        people: makePeople(names),
      });
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
          Recipes, the weekly plan, inventory, and the shopping list all live in one shared kitchen. Anyone whose email
          is on it signs in with Google and sees the same thing.
        </p>
        <p className="muted small">
          Nobody has added <strong>{user.email}</strong> to a kitchen yet. If someone already started one, ask them to
          add this email in Kitchen settings, then reload.
        </p>
        <label className="field">
          <span className="flabel">Kitchen name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Smith Kitchen"
          />
        </label>
        <label className="field">
          <span className="flabel">Who's eating?</span>
          <input
            className="input"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Sam, Alex, Riley"
            autoCapitalize="words"
          />
        </label>
        {names.length > 0 && (
          <div className="chips">
            {names.map((n) => (
              <span key={n} className="chip text">
                {n}
              </span>
            ))}
          </div>
        )}
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
        <p className="muted small" style={{ marginTop: 10 }}>
          Breakfast, lunch, and snacks start as one row per person, and dinner and dessert as one shared row. All of it
          can be changed later in Kitchen settings.
        </p>
        <button className="btn" type="submit" disabled={busy || !names.length}>
          {busy ? "Starting…" : "Start the kitchen"}
        </button>
      </form>
    </div>
  );
}

/* A setting that saves itself: edited locally, written on blur or Enter. */
function NameField({ label, saved, onSave, placeholder }) {
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  const commit = () => {
    const next = text.trim();
    if (!next) setText(saved);
    else if (next !== saved) onSave(next);
  };
  return (
    <input
      className="input"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/* Everything about the kitchen itself: its name, its people, how each meal
   is laid out, and who can see it. Every change saves as it's made.

   People are never deleted, only removed: a removed person drops off the
   plan and the rating prompts but keeps their history, and can be brought
   back. Renaming keeps everything, since plans and ratings refer to a
   person's key, not their name. */
export function KitchenSettings({ household, config, user, onError, onClose }) {
  const me = normEmail(user.email);
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (patch) => {
    setBusy(true);
    try {
      await saveKitchen(household.id, patch);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  // Stored exactly as shown, so a kitchen that has never been customized
  // gets its defaults written down the first time anything changes. A
  // section's saved list keeps removed people's keys, so bringing someone
  // back puts them back where they were.
  const people = config.people;
  const sectionsDoc = () => {
    const out = {};
    config.sections.forEach((s) => {
      const saved = household.sections?.[s.key]?.people;
      out[s.key] = {
        mode: s.mode,
        people: Array.isArray(saved) ? [...saved] : people.map((p) => p.key),
      };
    });
    return out;
  };

  const savePeople = (next) => save({ people: next });

  const rename = (key, name) => savePeople(people.map((p) => (p.key === key ? { ...p, name } : p)));
  const setActive = (key, active) => savePeople(people.map((p) => (p.key === key ? { ...p, active } : p)));
  // Swaps with the nearest active person above, skipping removed people who
  // aren't on screen, so every tap visibly moves someone.
  const moveUp = (key) => {
    const i = people.findIndex((p) => p.key === key);
    let j = i - 1;
    while (j >= 0 && !people[j].active) j -= 1;
    if (j < 0) return;
    const next = [...people];
    [next[j], next[i]] = [next[i], next[j]];
    savePeople(next);
  };

  // A new person joins every per-person section, which is almost always
  // what's wanted; untapping them from a section is one tap.
  const addPeople = (e) => {
    e.preventDefault();
    const names = splitItems(newName);
    if (!names.length) return;
    const added = makePeople(
      names,
      people.map((p) => p.key),
    );
    const sections = sectionsDoc();
    Object.values(sections).forEach((s) => {
      s.people = [...s.people, ...added.map((p) => p.key)];
    });
    setNewName("");
    save({ people: [...people, ...added], sections });
  };

  const setMode = (key, mode) => {
    const sections = sectionsDoc();
    sections[key].mode = mode;
    save({ sections });
  };

  const togglePerson = (sectionKey, personKey) => {
    const sections = sectionsDoc();
    const list = sections[sectionKey].people;
    sections[sectionKey].people = list.includes(personKey) ? list.filter((k) => k !== personKey) : [...list, personKey];
    save({ sections });
  };

  const addEmail = (e) => {
    e.preventDefault();
    const fresh = splitEmails(email).filter((x) => !household.memberEmails.includes(x));
    if (!fresh.length) return;
    setEmail("");
    saveMembers(household.id, [...household.memberEmails, ...fresh]).catch(onError);
  };

  const removed = people.filter((p) => !p.active);

  return (
    <div className="page narrow">
      <div className="pagehead">
        <h2 className="h2">Kitchen settings</h2>
        <button className="btn small" type="button" onClick={onClose}>
          Done
        </button>
      </div>

      <section className="card form">
        <h3 className="sechead">Kitchen name</h3>
        <NameField label="Kitchen name" saved={household.name} onSave={(name) => save({ name })} />
      </section>

      <section className="card form">
        <h3 className="sechead">People</h3>
        <div className="list" style={{ padding: 0 }}>
          {config.active.map((p, i) => (
            <div key={p.key} className="item personrow">
              <NameField label={`Name for ${p.name}`} saved={p.name} onSave={(name) => rename(p.key, name)} />
              <button
                className="iconbtn"
                type="button"
                disabled={busy || i === 0}
                aria-label={`Move ${p.name} up`}
                onClick={() => moveUp(p.key)}
              >
                ↑
              </button>
              <button
                className="iconbtn"
                type="button"
                disabled={busy}
                aria-label={`Remove ${p.name}`}
                title="Remove from the plan (keeps their history)"
                onClick={() =>
                  window.confirm(
                    `Remove ${p.name}? They'll drop off the plan and rating prompts. Their past plans and ratings stay, and you can bring them back.`,
                  ) && setActive(p.key, false)
                }
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addPeople} className="row gap" style={{ marginTop: 10, flexWrap: "nowrap" }}>
          <input
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add someone"
            autoCapitalize="words"
          />
          <button className="btn small" type="submit" disabled={busy || !newName.trim()}>
            Add
          </button>
        </form>
        {removed.length > 0 && (
          <div className="removed">
            <span className="muted small">Removed:</span>
            {removed.map((p) => (
              <button key={p.key} className="chipbtn" type="button" onClick={() => setActive(p.key, true)}>
                ↺ {p.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card form">
        <h3 className="sechead">Meals</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          <strong>Everyone</strong> is one shared row with a mods note, like a family dinner.{" "}
          <strong>Per person</strong> gives each chosen person their own row. Tap names to choose.
        </p>
        {config.sections.map((s) => (
          <div key={s.key} className="secset">
            <div className="secsethead">
              <span className="secname">{s.label}</span>
              <div className="seg" role="group" aria-label={`${s.label} layout`}>
                <button
                  type="button"
                  className={s.mode === "all" ? "on" : ""}
                  aria-pressed={s.mode === "all"}
                  onClick={() => s.mode !== "all" && setMode(s.key, "all")}
                >
                  Everyone
                </button>
                <button
                  type="button"
                  className={s.mode === "each" ? "on" : ""}
                  aria-pressed={s.mode === "each"}
                  onClick={() => s.mode !== "each" && setMode(s.key, "each")}
                >
                  Per person
                </button>
              </div>
            </div>
            {s.mode === "each" && (
              <div className="chipline">
                {config.active.map((p) => {
                  const on = s.people.some((x) => x.key === p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`chipbtn toggle ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() => togglePerson(s.key, p.key)}
                    >
                      {on ? "✓ " : ""}
                      {p.name}
                    </button>
                  );
                })}
                {s.people.length === 0 && <span className="muted small">Nobody: hidden from the plan.</span>}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card form">
        <h3 className="sechead">Who can see this kitchen</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          Everyone here signs in with Google using the email shown.
        </p>
        <div className="list" style={{ padding: 0 }}>
          {household.memberEmails.map((addr) => (
            <div key={addr} className="item">
              <span>
                {addr}
                {addr === me && <span className="muted small"> (you)</span>}
              </span>
              {addr !== me && (
                <button
                  className="iconbtn"
                  type="button"
                  aria-label={`Remove ${addr}`}
                  onClick={() =>
                    window.confirm(`Remove ${addr}?`) &&
                    saveMembers(
                      household.id,
                      household.memberEmails.filter((x) => x !== addr),
                    ).catch(onError)
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={addEmail} className="row gap" style={{ marginTop: 10, flexWrap: "nowrap" }}>
          <input
            className="input"
            type="text"
            inputMode="email"
            autoCapitalize="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Add an email"
          />
          <button className="btn small" type="submit" disabled={!email.trim()}>
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
