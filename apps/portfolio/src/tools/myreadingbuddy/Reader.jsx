import React, { useCallback, useEffect, useRef, useState } from "react";
import Spread from "./Spread";
import { clampIndex, hasAudio, turnDir } from "./book";
import { keepAwake } from "./media";
import { HomeIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";

// Breathing room between a page's last word and the page turning.
const AFTER_READING_MS = 900;
// A page nobody recorded still gets a moment to look at the pictures.
const SILENT_PAGE_MS = 4000;

/* The kids' side. Pick a book, press the big play button, and it reads
   itself: each page plays its recording, then the page turns and the next
   one starts. Pause stops it where it is; the arrows (or a swipe) turn
   pages by hand, and if it was reading it carries on from the new page. */
export default function Reader({ book, onClose }) {
  const pages = book.pages;
  const last = pages.length - 1;
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState(null);
  const [reading, setReading] = useState(false);
  const [theEnd, setTheEnd] = useState(false);
  const audioRef = useRef(null);
  const timer = useRef(null);
  const indexRef = useRef(0);
  indexRef.current = index;

  // Pages can be deleted while the book is open on another screen.
  useEffect(() => {
    if (index > last) setIndex(clampIndex(index, pages.length));
  }, [index, last, pages.length]);

  const clearTimer = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };

  const go = useCallback(
    (to) => {
      const dir = turnDir(indexRef.current, to, pages.length);
      if (!dir || turn) return;
      clearTimer();
      audioRef.current?.pause();
      setTheEnd(false);
      setTurn({ from: indexRef.current, to, dir });
    },
    [pages.length, turn]
  );

  const advance = useCallback(() => {
    if (indexRef.current < last) go(indexRef.current + 1);
    else {
      setReading(false);
      setTheEnd(true);
    }
  }, [go, last]);

  const onTurned = () => {
    if (!turn) return;
    setIndex(turn.to);
    setTurn(null);
  };

  // Point the one audio element at this page's voice. One element for the
  // whole book matters on iPhone and iPad: once a tap has let it play, it
  // may keep playing page after page without another tap.
  const load = (page) => {
    const a = audioRef.current;
    if (!a || !hasAudio(page)) return null;
    if (a.dataset.pid !== page.id) {
      a.src = page.audio.url;
      a.dataset.pid = page.id;
    }
    return a;
  };

  const blocked = (e) => {
    // The browser wants a tap first. Show the play button again.
    if (e?.name === "NotAllowedError") setReading(false);
    else console.warn("[readingbuddy] playback failed", e);
  };

  // Reading: play the page in view, or linger on a silent one, then turn.
  useEffect(() => {
    if (!reading || turn) return undefined;
    const page = pages[index];
    const a = load(page);
    if (a) {
      if (a.paused) a.play().catch(blocked);
      return undefined;
    }
    timer.current = setTimeout(advance, SILENT_PAGE_MS);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, turn, index, pages]);

  // Keep the screen on while the story reads itself.
  useEffect(() => {
    if (!reading) return undefined;
    let lock = null;
    let live = true;
    keepAwake().then((l) => {
      if (live) lock = l;
      else l?.release();
    });
    return () => {
      live = false;
      lock?.release().catch(() => {});
    };
  }, [reading]);

  useEffect(() => () => clearTimer(), []);

  const play = () => {
    let at = index;
    if (theEnd) {
      // "Read it again" goes straight back to the cover.
      at = 0;
      setIndex(0);
      setTheEnd(false);
    }
    // Start playback inside the tap itself, which is what lets iOS play.
    const a = load(pages[at]);
    if (a && !turn) a.play().catch(blocked);
    setReading(true);
  };

  const pause = () => {
    clearTimer();
    audioRef.current?.pause();
    setReading(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(indexRef.current + 1);
      else if (e.key === "ArrowLeft") go(indexRef.current - 1);
      else if (e.key === " ") {
        e.preventDefault();
        reading ? pause() : play();
      } else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const shown = turn ? turn.to : index;

  return (
    <div className="reader">
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        onEnded={() => {
          clearTimer();
          timer.current = setTimeout(advance, AFTER_READING_MS);
        }}
      />
      <header className="rtop">
        <button className="roundbtn" type="button" onClick={onClose} aria-label="Back to the bookshelf">
          <HomeIcon />
        </button>
        <div className="rtitle">
          <span className="rname">{book.title}</span>
          {book.readBy && <span className="rby">read by {book.readBy}</span>}
        </div>
        <span className="rcount" aria-live="polite">
          {shown + 1} / {pages.length}
        </span>
      </header>

      <Spread pages={pages} index={index} turn={turn} onTurned={onTurned} onSwipe={(d) => go(indexRef.current + d)}>
        {!reading && !turn && !theEnd && (
          <button className="bigplay" type="button" onClick={play} aria-label="Read to me">
            <PlayIcon />
          </button>
        )}
        {theEnd && (
          <div className="theend">
            <div className="endcard">
              <div className="endword">The End</div>
              <div className="row gap center">
                <button className="btn sun" type="button" onClick={play}>
                  Read it again
                </button>
                <button className="btn ghost" type="button" onClick={onClose}>
                  Pick another book
                </button>
              </div>
            </div>
          </div>
        )}
      </Spread>

      <div className="rotatehint">Turn the phone sideways for bigger pages</div>
      <footer className="rbar">
        <button
          className="roundbtn big"
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0 || !!turn}
          aria-label="Previous page"
        >
          <PrevIcon />
        </button>
        <button
          className={`playbtn ${reading ? "on" : ""}`}
          type="button"
          onClick={reading ? pause : play}
          aria-label={reading ? "Pause" : "Read to me"}
        >
          {reading ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="roundbtn big"
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= last || !!turn}
          aria-label="Next page"
        >
          <NextIcon />
        </button>
      </footer>
      {!hasAudio(pages[shown]) && <div className="quiet">No voice on this page yet</div>}
    </div>
  );
}
