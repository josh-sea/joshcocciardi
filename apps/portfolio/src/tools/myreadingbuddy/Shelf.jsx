import React, { useEffect, useState } from "react";
import { coverOf, isReadable, recordedCount } from "./book";
import { createBook, createShelf, normEmail, renameShelf, saveMembers } from "./store";

const splitEmails = (s) =>
  String(s || "")
    .split(/[\s,;]+/)
    .map(normEmail)
    .filter(Boolean);

/* First run: nobody has added this email to a bookshelf yet, so offer to
   start one, and to share it with whoever else will record or listen. */
export function ShelfSetup({ user, onError }) {
  const [name, setName] = useState("");
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await createShelf(user, { name, otherEmails: splitEmails(others) });
    } catch (err) {
      onError(err);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h2 className="h2">Start your bookshelf</h2>
        <p className="muted">
          Photograph the pages of a book, read it aloud one page at a time, and the kids can play it back whenever
          they like, turning the pages as they go.
        </p>
        <p className="muted small">
          Nobody has added <strong>{user.email}</strong> to a bookshelf yet. If someone already started one, ask them
          to add this email in Bookshelf settings, then reload.
        </p>
        <label className="field">
          <span className="flabel">Bookshelf name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bedtime Stories" />
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
        <p className="muted small">
          Everyone on the shelf signs in with Google and can add books, record, and listen.
        </p>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Starting…" : "Start the bookshelf"}
        </button>
      </form>
    </div>
  );
}

/* The bookshelf's name and who can see it. */
export function ShelfSettings({ shelf, user, onError, onClose }) {
  const me = normEmail(user.email);
  const [name, setName] = useState(shelf.name);
  const [email, setEmail] = useState("");
  useEffect(() => setName(shelf.name), [shelf.name]);

  const commitName = () => {
    const next = name.trim();
    if (!next) setName(shelf.name);
    else if (next !== shelf.name) renameShelf(shelf.id, next).catch(onError);
  };

  const addEmail = (e) => {
    e.preventDefault();
    const fresh = splitEmails(email).filter((x) => !shelf.memberEmails.includes(x));
    if (!fresh.length) return;
    setEmail("");
    saveMembers(shelf.id, [...shelf.memberEmails, ...fresh]).catch(onError);
  };

  return (
    <div className="page narrow">
      <div className="pagehead">
        <h2 className="h2">Bookshelf settings</h2>
        <button className="btn small" type="button" onClick={onClose}>
          Done
        </button>
      </div>
      <section className="card">
        <label className="field">
          <span className="flabel">Bookshelf name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
      </section>
      <section className="card">
        <h3 className="flabel">Who can see this bookshelf</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          Everyone here signs in with Google using the email shown, and can add books, record, and listen.
        </p>
        <ul className="members">
          {shelf.memberEmails.map((addr) => (
            <li key={addr}>
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
                      shelf.id,
                      shelf.memberEmails.filter((x) => x !== addr)
                    ).catch(onError)
                  }
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addEmail} className="row gap nowrap">
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

function NewBook({ sid, user, onMade, onCancel, onError }) {
  const [title, setTitle] = useState("");
  const [readBy, setReadBy] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    try {
      onMade(await createBook(sid, user.uid, { title, readBy }));
    } catch (err) {
      onError(err);
      setBusy(false);
    }
  };
  return (
    <form className="card form newbook" onSubmit={submit}>
      <h2 className="h2">A new book</h2>
      <label className="field">
        <span className="flabel">Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goodnight Moon" autoFocus />
      </label>
      <label className="field">
        <span className="flabel">Read by</span>
        <input className="input" value={readBy} onChange={(e) => setReadBy(e.target.value)} placeholder="Mom" />
      </label>
      <div className="row gap">
        <button className="btn" type="submit" disabled={busy || !title.trim()}>
          {busy ? "Making it…" : "Next: add pages"}
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// The book's own palette, so a shelf of books without covers yet still
// looks like a shelf of different books.
const SPINES = ["#E4572E", "#3A7CA5", "#F6AE2D", "#5DA271", "#8E5BB5", "#E27396"];
const spineFor = (id) => SPINES[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % SPINES.length];

/* The bookshelf. For kids it's just covers: tap one and it opens to read.
   Grown-ups mode adds the new-book button and an edit link on each book. */
export function Library({ sid, user, books, grownUps, onRead, onEdit, onError }) {
  const [making, setMaking] = useState(false);
  const shown = grownUps ? books : books.filter(isReadable);

  return (
    <div className="page wide">
      {grownUps && !making && (
        <div className="pagehead">
          <p className="muted small" style={{ margin: 0 }}>
            Grown-ups mode: add books, record, and edit. Switch it off before handing over the tablet.
          </p>
          <button className="btn" type="button" onClick={() => setMaking(true)}>
            + New book
          </button>
        </div>
      )}
      {making && (
        <NewBook
          sid={sid}
          user={user}
          onError={onError}
          onCancel={() => setMaking(false)}
          onMade={(bid) => {
            setMaking(false);
            onEdit(bid);
          }}
        />
      )}

      {shown.length === 0 && !making && (
        <div className="empty">
          {grownUps ? (
            <>No books yet. Tap <strong>+ New book</strong> to make the first one.</>
          ) : (
            <>No books on the shelf yet. A grown-up can add one in Grown-ups mode.</>
          )}
        </div>
      )}

      <ul className="shelf">
        {shown.map((b) => {
          const cover = coverOf(b);
          const n = recordedCount(b.pages);
          return (
            <li key={b.id} className="bookitem">
              <button
                className="cover"
                type="button"
                style={{ "--spine": spineFor(b.id) }}
                onClick={() => (isReadable(b) ? onRead(b.id) : onEdit(b.id))}
                aria-label={`Read ${b.title}`}
              >
                {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="nocover">{b.title}</span>}
              </button>
              <div className="booktitle">{b.title}</div>
              {b.readBy && <div className="bookby">read by {b.readBy}</div>}
              {grownUps && (
                <div className="bookmeta">
                  <span className="muted small">
                    {b.pages.length} pages · {n} recorded
                  </span>
                  <button className="chipbtn" type="button" onClick={() => onEdit(b.id)}>
                    Edit
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
