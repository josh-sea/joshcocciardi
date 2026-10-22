import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildTimeline, clock, recordedCount, videoFileName } from "./book";
import { keepAwake } from "./media";
import {
  canMakeVideo,
  loadFonts,
  newAudioContext,
  prepareBook,
  recordBook,
  releaseBook,
  videoType,
} from "./video";

/* Turn a finished book into a video file: the cover with its title and
   who's reading, each spread while its recording plays, a page turn, the
   next spread, and The End. Made on this device and saved to it, to keep
   or send to someone who doesn't use the app.

   phase: intro → loading → recording → done (or error) */
export default function Exporter({ book, onClose }) {
  const [phase, setPhase] = useState("intro");
  const [loaded, setLoaded] = useState({ done: 0, total: book.pages.length });
  const [time, setTime] = useState({ t: 0, total: 0 });
  const [monitor, setMonitor] = useState(true);
  const [result, setResult] = useState(null); // { url, file }
  const [poster, setPoster] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const canvasRef = useRef(null);
  const run = useRef(null); // { abort, ctx, prepared, wake }

  const supported = canMakeVideo();
  const recorded = recordedCount(book.pages);
  // From the stored lengths; the real one comes from the decoded audio.
  const estimate = useMemo(() => buildTimeline(book.pages.map((p) => p.audio?.secs || 0)).total, [book.pages]);
  const asMp4 = supported && videoType().startsWith("video/mp4");

  const teardown = () => {
    const r = run.current;
    run.current = null;
    if (!r) return;
    r.abort.abort();
    r.wake?.release().catch(() => {});
    releaseBook(r.prepared);
    r.ctx?.close().catch(() => {});
  };
  useEffect(() => teardown, []);
  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  const start = async () => {
    setError(null);
    setNote(null);
    // The AudioContext has to come from this tap, or iOS keeps it silent.
    const ctx = newAudioContext();
    const abort = new AbortController();
    run.current = { abort, ctx, prepared: null, wake: null };
    setPhase("loading");
    setLoaded({ done: 0, total: book.pages.length });
    try {
      keepAwake().then((w) => {
        if (run.current) run.current.wake = w;
        else w?.release();
      });
      await loadFonts();
      const prepared = await prepareBook(ctx, book, (done, total) => setLoaded({ done, total }), abort.signal);
      if (!run.current) return;
      run.current.prepared = prepared;
      if (prepared.skipped) setNote(`${prepared.skipped} recording${prepared.skipped > 1 ? "s" : ""} couldn't be read on this device, so those pages are silent.`);
      setTime({ t: 0, total: prepared.timeline.total });
      setPhase("recording");
      // Let React put the canvas on screen before drawing into it.
      await new Promise((r) => requestAnimationFrame(() => r()));
      const { blob, type } = await recordBook({
        canvas: canvasRef.current,
        ctx,
        book,
        prepared,
        monitor,
        onPoster: setPoster,
        signal: abort.signal,
        onTick: (t, total) => setTime({ t, total }),
      });
      const name = videoFileName(book, type);
      const file = new File([blob], name, { type: blob.type });
      setResult({ url: URL.createObjectURL(blob), file });
      setPhase("done");
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error("[readingbuddy] video", e);
      setError(
        e?.code?.startsWith?.("storage/")
          ? "Couldn't download the pages. Check the connection and try again."
          : e?.message || "Something went wrong making the video."
      );
      setPhase("error");
    } finally {
      teardown();
    }
  };

  const cancel = () => {
    teardown();
    setPhase("intro");
  };

  const shareable = useMemo(() => {
    if (!result || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [result.file] });
    } catch (e) {
      return false;
    }
  }, [result]);

  const share = async () => {
    try {
      await navigator.share({ files: [result.file], title: book.title });
    } catch (e) {
      if (e?.name !== "AbortError") setError("Sharing didn't work here. Use Download instead.");
    }
  };

  const pct = time.total ? Math.round((time.t / time.total) * 100) : 0;

  return (
    <div className="reader exporter">
      <header className="rtop">
        <button
          className="btn small ghost"
          type="button"
          onClick={phase === "loading" || phase === "recording" ? cancel : onClose}
        >
          {phase === "loading" || phase === "recording" ? "Cancel" : "Done"}
        </button>
        <div className="rtitle">
          <span className="rname">{book.title}</span>
          <span className="rby">Save as a video</span>
        </div>
        <span className="rcount" />
      </header>

      <div className="xbody">
        {phase === "intro" && (
          <div className="xcard">
            <h2 className="h2">Make a video of this book</h2>
            <p>
              The cover{book.readBy ? ` and “read by ${book.readBy}”` : ""}, then every page with its recording,
              turning the pages as it goes. Save it to your phone or send it to someone who doesn't use the app.
            </p>
            <p className="xsmall">
              It plays the book through once while it saves, so it takes about <strong>{clock(estimate)}</strong>.
              Keep this screen open until it's done.
            </p>
            {recorded < book.pages.length && (
              <p className="xsmall warn">
                {recorded === 0
                  ? "No pages have a recording yet, so the video will be silent."
                  : book.pages.length - recorded === 1
                  ? `1 of ${book.pages.length} pages has no recording; it'll show for a few seconds without sound.`
                  : `${book.pages.length - recorded} of ${book.pages.length} pages have no recording; they'll show for a few seconds without sound.`}
              </p>
            )}
            {supported && !asMp4 && (
              <p className="xsmall warn">
                This browser can only make WebM videos, which iPhones won't save to Photos. Safari or a current Chrome
                makes MP4.
              </p>
            )}
            {supported ? (
              <>
                <label className="xcheck">
                  <input type="checkbox" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} />
                  Play the sound while it saves
                </label>
                <button className="btn sun wide" type="button" onClick={start}>
                  Make the video
                </button>
              </>
            ) : (
              <p className="micerr">This browser can't make videos. Try Safari on an iPhone or iPad, or Chrome.</p>
            )}
          </div>
        )}

        {phase === "loading" && (
          <div className="xcard">
            <h2 className="h2">Getting the pages ready…</h2>
            <div className="bar" role="progressbar" aria-valuenow={loaded.done} aria-valuemax={loaded.total}>
              <span style={{ width: `${loaded.total ? (loaded.done / loaded.total) * 100 : 0}%` }} />
            </div>
            <p className="xsmall">
              Page {Math.min(loaded.done + 1, loaded.total)} of {loaded.total}
            </p>
          </div>
        )}

        {phase === "recording" && (
          <>
            <canvas ref={canvasRef} className="xcanvas" aria-label="Video preview" />
            <div className="xprog">
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <span>
                Saving the video · {clock(time.t)} of {clock(time.total)}
              </span>
            </div>
          </>
        )}

        {phase === "done" && result && (
          <div className="xdone">
            <video className="xvideo" src={result.url} poster={poster || undefined} controls playsInline />
            <div className="row gap center">
              {shareable && (
                <button className="btn sun" type="button" onClick={share}>
                  Save or share
                </button>
              )}
              <a className={`btn ${shareable ? "ghost" : "sun"}`} href={result.url} download={result.file.name}>
                Download
              </a>
              <button className="btn ghost" type="button" onClick={() => setPhase("intro")}>
                Make it again
              </button>
            </div>
            {error && <p className="micerr">{error}</p>}
            {shareable && <p className="xsmall">On iPhone: tap Save or share, then Save Video to put it in Photos.</p>}
            <p className="xsmall">
              {result.file.name} · {(result.file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        )}

        {note && <p className="xsmall warn">{note}</p>}
        {phase === "error" && (
          <div className="xcard">
            <p className="micerr">{error}</p>
            <button className="btn sun" type="button" onClick={() => setPhase("intro")}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
