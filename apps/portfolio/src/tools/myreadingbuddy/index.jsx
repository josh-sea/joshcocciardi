import React, { useCallback, useEffect, useState } from "react";
import CSS from "./styles";
import Editor from "./Editor";
import Reader from "./Reader";
import Recorder from "./Recorder";
import { Library, ShelfSettings, ShelfSetup } from "./Shelf";
import { authMessage, redirectSettled, signInWithGoogle, signOutOfReadingBuddy, watchAuth } from "./auth";
import { watchBooks, watchShelves } from "./store";

// ---------------------------------------------------------------------------
// My Reading Buddy: photograph a picture book spread by spread, record a
// grown-up reading each spread aloud, and the kids can open it from the
// shelf and hit play. It reads itself, turning the page when each
// recording ends. Books live on a shared bookshelf so one parent can record
// from anywhere and the kids listen at home on the other's login.
// ---------------------------------------------------------------------------

const GROWN_KEY = "readingbuddy.grownups";
const readGrown = () => {
  try {
    return window.localStorage.getItem(GROWN_KEY) === "1";
  } catch (e) {
    return false;
  }
};
const writeGrown = (on) => {
  try {
    window.localStorage.setItem(GROWN_KEY, on ? "1" : "0");
  } catch (e) {
    /* private mode: the setting just won't be remembered */
  }
};

const explain = (e) => {
  if (e?.code === "permission-denied" || e?.code === "storage/unauthorized")
    return "Firebase rules blocked that. If this is the first run, deploy the rules (./deploy.sh myreadingbuddy) and reload.";
  if (e?.code === "storage/retry-limit-exceeded" || e?.code === "unavailable")
    return "The connection dropped while saving. Check the Wi-Fi and try again.";
  return e?.message || String(e);
};

function Gate({ error, onSignIn, busy }) {
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
        <button className="btn" type="button" disabled={busy} onClick={onSignIn}>
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

export default function MyReadingBuddy() {
  const [user, setUser] = useState(undefined); // undefined while auth resolves
  const [authErr, setAuthErr] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [shelves, setShelves] = useState(undefined);
  const [books, setBooks] = useState(undefined);
  const [view, setView] = useState({ name: "shelf" });
  const [grownUps, setGrownUps] = useState(readGrown);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = () => {};
    let live = true;
    // Wait for a pending Google redirect to land before deciding "signed out".
    redirectSettled.then(() => {
      if (live) off = watchAuth((u) => setUser(u || null));
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  const onError = useCallback((e) => {
    console.error("[readingbuddy]", e);
    setError(explain(e));
  }, []);

  const verified = !!user && user.emailVerified && !!user.email;

  useEffect(() => {
    setShelves(undefined);
    if (!verified) return undefined;
    return watchShelves(user.email, setShelves, (e) => {
      onError(e);
      setShelves([]);
    });
  }, [user, verified, onError]);

  const shelf = shelves && shelves[0];

  // Books are only read once the server has confirmed the shelf: the rules
  // check membership against the stored document, so listening under a
  // shelf that's still a local write gets permission-denied.
  const [sid, setSid] = useState(null);
  useEffect(() => {
    if (!shelf) setSid(null);
    else if (!shelf.pending) setSid(shelf.id);
  }, [shelf]);

  useEffect(() => {
    setBooks(undefined);
    if (!sid) return undefined;
    return watchBooks(sid, setBooks, (e) => {
      onError(e);
      setBooks([]);
    });
  }, [sid, onError]);

  // A new shelf starts in grown-ups mode, since the first thing to do is
  // add a book.
  useEffect(() => {
    if (books && books.length === 0) setGrownUps(true);
  }, [books]);

  const signIn = async () => {
    setAuthBusy(true);
    setAuthErr(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setAuthErr(authMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const open = (next) => {
    setView(next);
    window.scrollTo(0, 0);
  };
  const toShelf = () => open({ name: "shelf" });

  // Leaving grown-ups mode always lands on the shelf, so the tablet is
  // never handed over sitting in the editor or settings.
  const toggleGrown = () => {
    const next = !grownUps;
    setGrownUps(next);
    writeGrown(next);
    if (!next) toShelf();
  };

  const book = view.bid && books ? books.find((b) => b.id === view.bid) : null;
  // The book was deleted (maybe from another device) while it was open.
  useEffect(() => {
    if (view.bid && books && !book) setView({ name: "shelf" });
  }, [view.bid, books, book]);

  let body;
  let bare = false; // reading and recording take the whole screen
  if (user === undefined) {
    body = <div className="center">checking your session…</div>;
  } else if (!user) {
    body = <Gate error={authErr} busy={authBusy} onSignIn={signIn} />;
  } else if (!verified) {
    body = (
      <div className="gate">
        <div className="card form gatecard">
          <h2 className="h2">Use Google to sign in</h2>
          <p className="muted">
            {user.email || "This account"} isn't a verified address, and bookshelves are shared by verified email. Sign
            out and continue with Google instead.
          </p>
          <button className="btn" type="button" onClick={signOutOfReadingBuddy}>
            Sign out
          </button>
        </div>
      </div>
    );
  } else if (shelves === undefined || (shelf && !sid) || (sid && books === undefined)) {
    body = <div className="center">opening the bookshelf…</div>;
  } else if (!shelf) {
    body = <ShelfSetup user={user} onError={onError} />;
  } else if (view.name === "settings") {
    body = <ShelfSettings shelf={shelf} user={user} onError={onError} onClose={toShelf} />;
  } else if (view.name === "read" && book && book.pages.length) {
    bare = true;
    body = <Reader key={book.id} book={book} onClose={() => open(grownUps ? { name: "edit", bid: book.id } : { name: "shelf" })} />;
  } else if (view.name === "record" && book && book.pages.length) {
    bare = true;
    body = (
      <Recorder
        key={book.id}
        sid={sid}
        book={book}
        startAt={view.at}
        onError={onError}
        onClose={() => open({ name: "edit", bid: book.id })}
      />
    );
  } else if (view.name === "edit" && book) {
    body = (
      <Editor
        sid={sid}
        book={book}
        onError={onError}
        onClose={toShelf}
        onRead={() => open({ name: "read", bid: book.id })}
        onRecord={(at) => open({ name: "record", bid: book.id, at })}
      />
    );
  } else {
    body = (
      <Library
        sid={sid}
        user={user}
        books={books || []}
        grownUps={grownUps}
        onError={onError}
        onRead={(bid) => open({ name: "read", bid })}
        onEdit={(bid) => open({ name: "edit", bid })}
      />
    );
  }

  return (
    <div className={`rb ${bare ? "bare" : ""}`}>
      <style>{CSS}</style>
      {user && !bare && (
        <header className="top">
          <button className="brand" type="button" onClick={toShelf}>
            <span aria-hidden="true">📖</span> {shelf ? shelf.name : "My Reading Buddy"}
          </button>
          {shelf && (
            <span className="acct">
              <button
                className={`toggle ${grownUps ? "on" : ""}`}
                type="button"
                aria-pressed={grownUps}
                onClick={toggleGrown}
              >
                Grown-ups
              </button>
              {grownUps && (
                <>
                  <button className="linkish" type="button" onClick={() => open({ name: "settings" })}>
                    settings
                  </button>
                  <button className="linkish" type="button" onClick={signOutOfReadingBuddy}>
                    sign out
                  </button>
                </>
              )}
            </span>
          )}
        </header>
      )}
      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button className="iconbtn" type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {body}
    </div>
  );
}
