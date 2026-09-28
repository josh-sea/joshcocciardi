import React, { useCallback, useEffect, useState } from "react";
import CSS from "./styles";
import Editor from "./Editor";
import Reader from "./Reader";
import Recorder from "./Recorder";
import { Library, ShelfSettings, ShelfSetup } from "./Shelf";
import { redirectSettled, signOutOfReadingBuddy, watchAuth } from "./auth";
import { SignIn, VerifyEmail } from "./SignIn";
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

export default function MyReadingBuddy() {
  const [user, setUser] = useState(undefined); // undefined while auth resolves
  // Bumped when an email account's link has been clicked. Firebase updates
  // the user object in place, so something has to tell React to look again.
  const [, setVerifiedAt] = useState(0);
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
    body = <SignIn />;
  } else if (!verified) {
    body = <VerifyEmail user={user} onVerified={() => setVerifiedAt(Date.now())} />;
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
