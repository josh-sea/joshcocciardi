import React, { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Icon } from "../../site/ui";
import "../../site/site.css";

/* Messages sent from the public /contact form. Reading, marking and deleting
   are allowed only for the allowlisted account (firestore.rules,
   contact_messages); this page is just the view onto them. */

const fmt = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "just now";

const Inbox = ({ user }) => {
  const [msgs, setMsgs] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const q = query(collection(db, "contact_messages"), orderBy("createdAt", "desc"), limit(200));
    return onSnapshot(
      q,
      (snap) => setMsgs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setErr(e.code || String(e))
    );
  }, []);

  const toggleRead = (m) => updateDoc(doc(db, "contact_messages", m.id), { read: !m.read });
  const remove = (m) => {
    if (window.confirm(`Delete the message from ${m.name}?`)) deleteDoc(doc(db, "contact_messages", m.id));
  };
  const replyHref = (m) =>
    `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("Re: your note on joshcocciardi.com")}&body=${encodeURIComponent(
      `\n\n> ${m.message.split("\n").join("\n> ")}`
    )}`;

  const unread = msgs ? msgs.filter((m) => !m.read).length : 0;
  const shown = msgs ? msgs.filter((m) => filter === "all" || !m.read) : [];

  return (
    <div className="site">
      <main className="site-main">
        <div className="wrap" style={{ maxWidth: 820 }}>
          <header className="page-head">
            <p className="muted">Signed in as {user.email}</p>
            <h1>Inbox</h1>
            <p>Messages from the contact form. {msgs && `${unread} unread of ${msgs.length}.`}</p>
          </header>

          <div className="chips-row" style={{ marginTop: 24 }} role="group" aria-label="Filter">
            <button type="button" className="key key--small key--pill" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              All
            </button>
            <button
              type="button"
              className="key key--small key--pill"
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
            >
              Unread <span className="count">{unread}</span>
            </button>
          </div>

          {err && (
            <div className="notice notice--error" style={{ marginTop: 20 }}>
              Couldn't load messages ({err}).
            </div>
          )}
          {!msgs && !err && <p className="muted" style={{ marginTop: 24 }}>Loading…</p>}
          {msgs && shown.length === 0 && (
            <div className="empty">
              <p>{filter === "unread" ? "All caught up." : "No messages yet."}</p>
            </div>
          )}

          <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
            {shown.map((m) => (
              <article key={m.id} className="card pcard" style={{ padding: 20 }}>
                <div className="job-head">
                  <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {!m.read && <span className="job-when now">New</span>}
                    {m.name}
                  </h3>
                  <span className="job-when">{fmt(m.createdAt)}</span>
                </div>
                <a className="pcard-tech" href={`mailto:${m.email}`} style={{ display: "block", textDecoration: "none" }}>
                  {m.email}
                </a>
                <p style={{ marginTop: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.message}</p>
                <div className="pcard-foot" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" className="key key--small" onClick={() => remove(m)}>
                    Delete
                  </button>
                  <button type="button" className="key key--small" onClick={() => toggleRead(m)}>
                    Mark {m.read ? "unread" : "read"}
                  </button>
                  <a className="key key--small key--blue" href={replyHref(m)} onClick={() => !m.read && toggleRead(m)}>
                    <Icon name="send" size={13} /> Reply
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Inbox;
