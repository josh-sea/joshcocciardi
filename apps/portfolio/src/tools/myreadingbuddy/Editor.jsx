import React, { useEffect, useRef, useState } from "react";
import { clock, firstUnrecorded, hasAudio, movePage, orderFiles, recordedCount } from "./book";
import { shrinkImage } from "./media";
import { addPage, deleteBook, deletePage, saveBook, updatePages } from "./store";
import { MicIcon, PlayIcon } from "./icons";

/* A field that saves itself: edited locally, written on blur or Enter. */
function SavedField({ label, saved, onSave, placeholder }) {
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  const commit = () => {
    const next = text.trim();
    if (next !== saved) onSave(next);
  };
  return (
    <label className="field">
      <span className="flabel">{label}</span>
      <input
        className="input"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );
}

/* Building a book: its name, the photographed spreads in order, and which
   of them have a voice yet. Recording itself happens in the Recorder. */
export default function Editor({ sid, book, onClose, onRecord, onRead, onError }) {
  const fileRef = useRef(null);
  const [upload, setUpload] = useState(null); // { done, total } while adding pages
  const [playing, setPlaying] = useState(null); // page id being previewed
  const audioRef = useRef(null);
  const pages = book.pages;
  const done = recordedCount(pages);

  const save = (patch) => saveBook(sid, book.id, patch).catch(onError);

  const addFiles = async (fileList) => {
    const files = orderFiles(fileList);
    if (!files.length) return;
    setUpload({ done: 0, total: files.length });
    try {
      // One at a time, so pages land in order and a big batch doesn't hold
      // a dozen full-size photos in memory at once.
      for (let i = 0; i < files.length; i += 1) {
        const image = await shrinkImage(files[i]);
        await addPage(sid, book.id, image);
        setUpload({ done: i + 1, total: files.length });
      }
    } catch (e) {
      onError(e);
    } finally {
      setUpload(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const move = (id, delta) => updatePages(sid, book.id, (list) => movePage(list, id, delta)).catch(onError);

  const preview = (p) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing === p.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = p.audio.url;
    a.play()
      .then(() => setPlaying(p.id))
      .catch((e) => console.warn("[readingbuddy] playback failed", e));
  };

  const removeBook = async () => {
    if (!window.confirm(`Delete "${book.title}" and all of its pages and recordings? This can't be undone.`)) return;
    try {
      await deleteBook(sid, book);
      onClose();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="page">
      <audio ref={audioRef} playsInline onEnded={() => setPlaying(null)} />
      <div className="pagehead">
        <button className="btn small ghost" type="button" onClick={onClose}>
          ← Bookshelf
        </button>
        {pages.length > 0 && (
          <button className="btn small sky" type="button" onClick={onRead}>
            Read it
          </button>
        )}
      </div>

      <section className="card">
        <SavedField label="Book title" saved={book.title} placeholder="Goodnight Moon" onSave={(title) => save({ title: title || "Untitled book" })} />
        <SavedField label="Read by" saved={book.readBy} placeholder="Mom" onSave={(readBy) => save({ readBy })} />
      </section>

      <section className="card">
        <div className="sechead">
          <h2 className="h2">Pages</h2>
          <span className="muted small">
            {pages.length ? `${done} of ${pages.length} recorded` : "No pages yet"}
          </span>
        </div>
        <p className="muted small">
          Take a photo of each open spread (both pages at once), or pick scans from your photos. Add them in reading
          order; you can move them after.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="row gap">
          <button className="btn" type="button" disabled={!!upload} onClick={() => fileRef.current?.click()}>
            {upload ? `Adding page ${Math.min(upload.done + 1, upload.total)} of ${upload.total}…` : "+ Add pages"}
          </button>
          {pages.length > 0 && (
            <button
              className="btn berry"
              type="button"
              disabled={!!upload}
              onClick={() => onRecord(firstUnrecorded(pages))}
            >
              <MicIcon /> {done === 0 ? "Record the book" : done < pages.length ? "Keep recording" : "Re-record pages"}
            </button>
          )}
        </div>
      </section>

      {pages.length > 0 && (
        <ol className="pagelist">
          {pages.map((p, i) => (
            <li key={p.id} className="pagecard">
              <img className="thumb" src={p.image.url} alt={`Page ${i + 1}`} loading="lazy" />
              <div className="pageinfo">
                <div className="pagetop">
                  <strong>Page {i + 1}</strong>
                  {hasAudio(p) ? (
                    <span className="tag ok">✓ {clock(p.audio.secs)}</span>
                  ) : (
                    <span className="tag">no voice yet</span>
                  )}
                </div>
                <div className="pageacts">
                  <button className="chipbtn" type="button" onClick={() => onRecord(i)}>
                    <MicIcon /> {hasAudio(p) ? "Redo" : "Record"}
                  </button>
                  {hasAudio(p) && (
                    <button className="chipbtn" type="button" onClick={() => preview(p)}>
                      {playing === p.id ? "■ Stop" : (
                        <>
                          <PlayIcon /> Play
                        </>
                      )}
                    </button>
                  )}
                  <span className="spacer" />
                  <button className="iconbtn" type="button" disabled={i === 0} onClick={() => move(p.id, -1)} aria-label={`Move page ${i + 1} earlier`}>
                    ↑
                  </button>
                  <button
                    className="iconbtn"
                    type="button"
                    disabled={i === pages.length - 1}
                    onClick={() => move(p.id, 1)}
                    aria-label={`Move page ${i + 1} later`}
                  >
                    ↓
                  </button>
                  <button
                    className="iconbtn"
                    type="button"
                    aria-label={`Remove page ${i + 1}`}
                    onClick={() =>
                      window.confirm(`Remove page ${i + 1}${hasAudio(p) ? " and its recording" : ""}?`) &&
                      deletePage(sid, book.id, p.id).catch(onError)
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="danger">
        <button className="linkish" type="button" onClick={removeBook}>
          Delete this book
        </button>
      </div>
    </div>
  );
}
