import React, { useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { PROFILE } from "./data";
import { Icon, usePageTitle } from "./ui";

// Messages land in Firestore at contact_messages/{auto-id}. The rules (repo
// root firestore.rules) let anyone create one with exactly these fields, and
// only Josh's verified account read, mark or delete them. They're read at
// /work/inbox.
export const LIMITS = { name: 100, email: 200, message: 5000 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_FILL_MS = 2500; // humans don't fill a form in under 2.5s

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this:", text);
    }
  };
  return (
    <button type="button" className="key key--small key--icon" onClick={copy} aria-label={copied ? "Copied" : "Copy email address"}>
      <Icon name={copied ? "check" : "copy"} size={15} />
    </button>
  );
};

const Contact = () => {
  usePageTitle("Contact");
  const openedAt = useRef(Date.now());
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    const fail = (msg) => {
      setError(msg);
      setStatus("error");
    };
    if (!name || !email || !message) return fail("All three fields are needed.");
    if (!EMAIL_RE.test(email)) return fail("That email address doesn't look right.");

    // Bots: fill the hidden field, or submit instantly. Pretend it worked.
    if (form.website || Date.now() - openedAt.current < MIN_FILL_MS) {
      setStatus("sent");
      return;
    }

    setStatus("sending");
    setError("");
    try {
      await addDoc(collection(db, "contact_messages"), {
        name: name.slice(0, LIMITS.name),
        email: email.slice(0, LIMITS.email),
        message: message.slice(0, LIMITS.message),
        createdAt: serverTimestamp(),
        read: false,
      });
      setStatus("sent");
      setForm({ name: "", email: "", message: "", website: "" });
    } catch (err) {
      console.warn("[contact] send failed:", err?.code || err);
      setError("That didn't go through. Try again, or email me directly.");
      setStatus("error");
    }
  };

  return (
    <>
      <header className="page-head">
        <span className="label">Contact</span>
        <h1>Say hello</h1>
        <p>Leave a note here and it comes straight to me, or use whichever of the direct lines you like.</p>
      </header>

      <div className="contact-grid">
        {status === "sent" ? (
          <div className="panel sent" role="status">
            <span className="tile tile--lg" style={{ margin: "0 auto" }} aria-hidden="true">
              📬
            </span>
            <h2>Message sent</h2>
            <p>Thanks for reaching out. I'll get back to you at the address you gave.</p>
            <button
              type="button"
              className="key"
              onClick={() => {
                openedAt.current = Date.now();
                setStatus("idle");
              }}
            >
              Send another
            </button>
          </div>
        ) : (
          <form className="panel form" onSubmit={submit} noValidate>
            <div className="form-row">
              <div className="field">
                <label htmlFor="c-name">Name</label>
                <input
                  id="c-name"
                  autoComplete="name"
                  maxLength={LIMITS.name}
                  value={form.name}
                  onChange={set("name")}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="c-email">Email</label>
                <input
                  id="c-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={LIMITS.email}
                  value={form.email}
                  onChange={set("email")}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="c-msg">Message</label>
              <textarea
                id="c-msg"
                maxLength={LIMITS.message}
                value={form.message}
                onChange={set("message")}
                required
              />
              <span className="field-hint">
                {form.message.length} / {LIMITS.message}
              </span>
            </div>

            {/* Honeypot: hidden from people, irresistible to form bots. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="c-web">Website</label>
              <input id="c-web" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
            </div>

            {status === "error" && (
              <div className="notice notice--error" role="alert">
                {error}
              </div>
            )}

            <div className="form-foot">
              <p className="form-note">No tracking, no mailing list. Your address is only used to reply.</p>
              <button type="submit" className="key key--accent" disabled={status === "sending"}>
                <Icon name="send" size={15} />
                {status === "sending" ? "Sending…" : "Send message"}
              </button>
            </div>
          </form>
        )}

        <aside className="panel direct" aria-label="Direct contact">
          <div className="direct-row">
            <span className="tile" aria-hidden="true">
              <Icon name="mail" size={18} />
            </span>
            <div className="direct-text">
              <span className="label">Email</span>
              <a href={`mailto:${PROFILE.email}`}>{PROFILE.email}</a>
            </div>
            <CopyButton text={PROFILE.email} />
          </div>
          <div className="direct-row">
            <span className="tile" aria-hidden="true">
              <Icon name="phone" size={18} />
            </span>
            <div className="direct-text">
              <span className="label">Phone</span>
              <a href={PROFILE.phoneHref}>{PROFILE.phone}</a>
            </div>
          </div>
          <div className="direct-row">
            <span className="tile" aria-hidden="true">
              in
            </span>
            <div className="direct-text">
              <span className="label">LinkedIn</span>
              <a href={PROFILE.linkedin} target="_blank" rel="noopener noreferrer">
                linkedin.com/in/joshcocciardi
              </a>
            </div>
          </div>
          <div className="direct-row">
            <span className="tile" aria-hidden="true">
              {"</>"}
            </span>
            <div className="direct-text">
              <span className="label">GitHub</span>
              <a href={PROFILE.github} target="_blank" rel="noopener noreferrer">
                github.com/josh-sea
              </a>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default Contact;
