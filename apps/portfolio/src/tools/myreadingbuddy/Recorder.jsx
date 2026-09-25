import React, { useCallback, useEffect, useRef, useState } from "react";
import Spread from "./Spread";
import { clampIndex, clock, hasAudio, recordedCount, turnDir } from "./book";
import { canRecord, closeMic, keepAwake, openMic, startTake } from "./media";
import { saveRecording } from "./store";
import { MicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, StopIcon } from "./icons";

const micMessage = (e) => {
  if (e?.name === "NotAllowedError" || e?.name === "SecurityError")
    return "The microphone is blocked. Allow it for this site in your browser settings, then try again.";
  if (e?.name === "NotFoundError") return "No microphone found on this device.";
  return e?.message || "Couldn't start the microphone.";
};

/* The grown-ups' side: read the book aloud a page at a time. Tap the
   microphone, read the page on screen, tap stop. The take uploads, and the
   page turns to the next one that still needs a voice, so a whole book is
   record, stop, record, stop. Any page can be played back or redone. */
export default function Recorder({ sid, book, startAt, onClose, onError }) {
  const pages = book.pages;
  const [index, setIndex] = useState(() => clampIndex(startAt || 0, pages.length));
  const [turn, setTurn] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | starting | recording | saving
  const [elapsed, setElapsed] = useState(0);
  const [listening, setListening] = useState(false);
  const [micErr, setMicErr] = useState(null);
  const stream = useRef(null);
  const take = useRef(null);
  const tick = useRef(null);
  const audioRef = useRef(null);

  const page = pages[turn ? turn.to : index];
  const done = recordedCount(pages);
  const supported = canRecord();

  useEffect(() => {
    if (index > pages.length - 1) setIndex(clampIndex(index, pages.length));
  }, [index, pages.length]);

  // Let go of the microphone (and the recording light) on the way out.
  useEffect(
    () => () => {
      take.current?.cancel();
      clearInterval(tick.current);
      closeMic(stream.current);
    },
    []
  );

  useEffect(() => {
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
  }, []);

  const stopListening = () => {
    audioRef.current?.pause();
    setListening(false);
  };

  const go = useCallback(
    (to) => {
      const dir = turnDir(index, to, pages.length);
      if (!dir || turn || phase !== "idle") return;
      stopListening();
      setTurn({ from: index, to, dir });
    },
    [index, pages.length, turn, phase]
  );

  const record = async () => {
    stopListening();
    setMicErr(null);
    setPhase("starting");
    try {
      if (!stream.current) stream.current = await openMic();
      take.current = startTake(stream.current);
      setElapsed(0);
      const began = Date.now();
      tick.current = setInterval(() => setElapsed((Date.now() - began) / 1000), 250);
      setPhase("recording");
    } catch (e) {
      setMicErr(micMessage(e));
      setPhase("idle");
    }
  };

  const stop = async () => {
    const t = take.current;
    take.current = null;
    clearInterval(tick.current);
    if (!t) return;
    setPhase("saving");
    const pageId = page.id;
    try {
      const { blob, secs } = await t.stop();
      if (secs < 0.8 || !blob.size) {
        setMicErr("That was too short to keep. Tap the microphone and read the page.");
        setPhase("idle");
        return;
      }
      await saveRecording(sid, book.id, pageId, blob, secs);
      setPhase("idle");
      // On to the next page that still needs a voice, if it's the next one.
      const i = pages.findIndex((p) => p.id === pageId);
      if (i >= 0 && i < pages.length - 1 && !hasAudio(pages[i + 1])) {
        setTurn({ from: i, to: i + 1, dir: 1 });
      }
    } catch (e) {
      setPhase("idle");
      onError(e);
    }
  };

  const listen = () => {
    const a = audioRef.current;
    if (!a || !hasAudio(page)) return;
    if (listening) return stopListening();
    if (a.dataset.url !== page.audio.url) {
      a.src = page.audio.url;
      a.dataset.url = page.audio.url;
    }
    a.currentTime = 0;
    a.play()
      .then(() => setListening(true))
      .catch((e) => console.warn("[readingbuddy] playback failed", e));
  };

  const busy = phase !== "idle" || !!turn;
  const last = index >= pages.length - 1;

  return (
    <div className="reader recorder">
      <audio ref={audioRef} playsInline onEnded={() => setListening(false)} />
      <header className="rtop">
        <button className="btn small ghost" type="button" onClick={onClose} disabled={phase === "recording" || phase === "saving"}>
          Done
        </button>
        <div className="rtitle">
          <span className="rname">{book.title}</span>
          <span className="rby">
            {done} of {pages.length} pages recorded
          </span>
        </div>
        <span className="rcount">
          {(turn ? turn.to : index) + 1} / {pages.length}
        </span>
      </header>

      <Spread
        pages={pages}
        index={index}
        turn={turn}
        onTurned={() => {
          setIndex(turn.to);
          setTurn(null);
        }}
        onSwipe={(d) => go(index + d)}
      >
        {phase === "recording" && (
          <div className="onair" aria-live="polite">
            <span className="dot" /> Recording {clock(elapsed)}
          </div>
        )}
      </Spread>

      {micErr && (
        <div className="micerr" role="alert">
          {micErr}
        </div>
      )}
      {!supported && (
        <div className="micerr" role="alert">
          This browser can't record audio. Try Safari on an iPhone or iPad, or Chrome.
        </div>
      )}

      <footer className="rbar">
        <button className="roundbtn big" type="button" onClick={() => go(index - 1)} disabled={busy || index === 0} aria-label="Previous page">
          <PrevIcon />
        </button>

        <div className="reccol">
          {phase === "recording" ? (
            <button className="recbtn live" type="button" onClick={stop} aria-label="Stop recording">
              <StopIcon />
            </button>
          ) : (
            <button
              className="recbtn"
              type="button"
              onClick={record}
              disabled={!supported || busy}
              aria-label={hasAudio(page) ? "Record this page again" : "Record this page"}
            >
              <MicIcon />
            </button>
          )}
          <span className="reclabel">
            {phase === "starting" && "Starting the microphone…"}
            {phase === "recording" && "Tap to stop"}
            {phase === "saving" && "Saving…"}
            {phase === "idle" && (hasAudio(page) ? "Record again" : "Tap and read this page")}
          </span>
        </div>

        <button className="roundbtn big" type="button" onClick={() => go(index + 1)} disabled={busy || last} aria-label="Next page">
          <NextIcon />
        </button>
      </footer>

      {hasAudio(page) && phase === "idle" && !turn && (
        <div className="listenrow">
          <button className="chipbtn light" type="button" onClick={listen}>
            {listening ? <PauseIcon /> : <PlayIcon />} {listening ? "Stop" : `Listen (${clock(page.audio.secs)})`}
          </button>
        </div>
      )}
    </div>
  );
}
