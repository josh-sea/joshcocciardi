import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_DETAILS,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_LINKS,
  detailSummary,
  fileSize,
  linkLabel,
  makeComment,
  makeLink,
  when,
} from "./details";
import { addDetail, removeDetail, saveDetails, uploadAttachment } from "./store";
import { OWNERS } from "./tree";

const NOTES_DELAY = 700;

/* Notes autosave on a debounce, like the tree, and flush when the step
   changes or the drawer unmounts. The textarea owns its text while it has
   unsaved edits, so a snapshot echo can't overwrite what is being typed. */
function Notes({ implId, nodeId, value }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState("saved");
  const dirtyRef = useRef(false);
  const textRef = useRef(value);
  const timerRef = useRef(null);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (!dirtyRef.current) return;
    const t = textRef.current;
    try {
      await saveDetails(implId, nodeId, { notes: t });
      if (textRef.current === t) {
        dirtyRef.current = false;
        setState("saved");
      }
    } catch (e) {
      console.error("[mise] notes save failed:", e);
      setState("error");
    }
  }, [implId, nodeId]);

  useEffect(() => () => flush(), [flush]);

  useEffect(() => {
    if (!dirtyRef.current && value !== textRef.current) {
      textRef.current = value;
      setText(value);
    }
  }, [value]);

  const onChange = (e) => {
    textRef.current = e.target.value;
    setText(e.target.value);
    dirtyRef.current = true;
    setState("saving");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, NOTES_DELAY);
  };

  return (
    <section className="dsec dnotes">
      <div className="dhead">
        <span className="flabel">Notes</span>
        <span className={`state${state === "saved" ? "" : state === "error" ? " failed" : " dirty"}`}>
          {state === "saved" ? (text ? "saved" : "") : state === "saving" ? "saving…" : "not saved"}
        </span>
        {state === "error" && (
          <button className="linkish" type="button" onClick={flush}>
            retry
          </button>
        )}
      </div>
      <textarea
        className="area dtext"
        value={text}
        onChange={onChange}
        onBlur={flush}
        placeholder="Confirmation numbers, who you spoke with, what's still needed…"
      />
    </section>
  );
}

function Links({ implId, nodeId, links, onError }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [bad, setBad] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    const link = makeLink(url, label);
    if (!link) {
      setBad(true);
      return;
    }
    setUrl("");
    setLabel("");
    setBad(false);
    try {
      await addDetail(implId, nodeId, "links", link);
    } catch (x) {
      onError(x);
    }
  };

  return (
    <section className="dsec">
      <div className="dhead">
        <span className="flabel">Links</span>
        <span className="sub">{links.length || ""}</span>
      </div>
      {links.map((l) => (
        <div className="ditem" key={l.id}>
          <a className="dlink" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
            {linkLabel(l)} ↗
          </a>
          <button
            className="dx"
            type="button"
            title="Remove link"
            onClick={() => removeDetail(implId, nodeId, "links", l).catch(onError)}
          >
            ×
          </button>
        </div>
      ))}
      {links.length < MAX_LINKS && (
        <form className="dadd" onSubmit={add}>
          <input
            className="input"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setBad(false);
            }}
            placeholder="dmv.ny.gov/change-address"
            inputMode="url"
            aria-label="Link URL"
          />
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            aria-label="Link label"
          />
          <button className="act" type="submit" disabled={!url.trim()}>
            add
          </button>
        </form>
      )}
      {bad && <div className="dwarn">That doesn't look like a web address.</div>}
    </section>
  );
}

const isImage = (a) => /^image\//.test(a.type);

function Files({ ownerUid, implId, nodeId, attachments, onError }) {
  const [uploads, setUploads] = useState([]); // { key, name, pct }
  const [over, setOver] = useState(false);
  const pickRef = useRef(null);
  const room = MAX_ATTACHMENTS - attachments.length - uploads.length;

  const send = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) onError(new Error(`${tooBig.map((f) => f.name).join(", ")}: over the 25 MB limit.`));
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES).slice(0, Math.max(room, 0));
    if (files.length - tooBig.length > ok.length) onError(new Error(`Only ${MAX_ATTACHMENTS} files per step.`));
    await Promise.all(
      ok.map(async (f) => {
        const key = `${f.name}-${Math.random()}`;
        setUploads((u) => [...u, { key, name: f.name, pct: 0 }]);
        try {
          const rec = await uploadAttachment(ownerUid, implId, nodeId, f, (pct) =>
            setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct } : x)))
          );
          await addDetail(implId, nodeId, "attachments", rec);
        } catch (x) {
          onError(new Error(`${f.name}: ${x.message}`));
        } finally {
          setUploads((u) => u.filter((x) => x.key !== key));
        }
      })
    );
  };

  const remove = (a) => {
    if (!window.confirm(`Remove "${a.name}"? The file is deleted.`)) return;
    removeDetail(implId, nodeId, "attachments", a, a.path).catch(onError);
  };

  return (
    <section
      className={`dsec dfiles${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        send(e.dataTransfer.files);
      }}
    >
      <div className="dhead">
        <span className="flabel">Files</span>
        <span className="sub">{attachments.length || ""}</span>
      </div>
      {attachments.map((a) => (
        <div className="ditem" key={a.id}>
          {isImage(a) ? (
            <img className="dthumb" src={a.url} alt="" />
          ) : (
            <span className="dicon">{(a.name.split(".").pop() || "file").slice(0, 4)}</span>
          )}
          <a className="dlink" href={a.url} target="_blank" rel="noopener noreferrer">
            {a.name}
          </a>
          <span className="sub dmeta">{fileSize(a.size)}</span>
          <button className="dx" type="button" title="Remove file" onClick={() => remove(a)}>
            ×
          </button>
        </div>
      ))}
      {uploads.map((u) => (
        <div className="ditem" key={u.key}>
          <span className="dicon">…</span>
          <span className="dlink">{u.name}</span>
          <span className="sub dmeta">{Math.round(u.pct * 100)}%</span>
        </div>
      ))}
      {room > 0 && (
        <button className="ddrop" type="button" onClick={() => pickRef.current?.click()}>
          drop files here or <u>choose</u> · scans, PDFs, photos · 25 MB each
        </button>
      )}
      <input
        ref={pickRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          send(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function Comments({ implId, nodeId, user, comments, onError }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [comments.length]);

  const add = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    const c = makeComment(text, user);
    setText("");
    try {
      await addDetail(implId, nodeId, "comments", c);
    } catch (x) {
      setText(c.text);
      onError(x);
    }
  };

  return (
    <section className="dsec">
      <div className="dhead">
        <span className="flabel">Comments</span>
        <span className="sub">{comments.length || ""}</span>
      </div>
      <div className="dthread">
        {comments.map((c) => (
          <div className="dcomment" key={c.id}>
            <div className="sub">
              {c.name || "you"} · {when(c.at)}
              <button
                className="dx"
                type="button"
                title="Delete comment"
                onClick={() => removeDetail(implId, nodeId, "comments", c).catch(onError)}
              >
                ×
              </button>
            </div>
            <div className="dctext">{c.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="dadd" onSubmit={add}>
        <textarea
          className="area dsmall"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(e);
          }}
          placeholder="Add an update… (⌘/Ctrl + Enter)"
        />
        <button className="act solid" type="submit" disabled={!text.trim()}>
          post
        </button>
      </form>
    </section>
  );
}

/* The bottom drawer for the selected step. Collapsed it is the old action
   dock; open, it slides up to hold the step's notes, links, files, and a
   running comment log. */
export default function Drawer({ implId, ownerUid, user, node, details, open, onToggle, children }) {
  const d = details || EMPTY_DETAILS;
  const [err, setErr] = useState(null);
  const onError = useCallback((e) => {
    console.error("[mise] details:", e);
    setErr(e.code === "permission-denied" ? "Blocked by security rules. Deploy them with ./deploy.sh mise." : e.message);
  }, []);

  useEffect(() => setErr(null), [node.id]);

  const summary = detailSummary(d);

  return (
    <div className={`dock${open ? " open" : ""}`} role="region" aria-label="Step details">
      <button className="grip" type="button" onClick={onToggle} aria-label={open ? "Collapse details" : "Expand details"}>
        <span />
      </button>
      <div className="dockname">
        <span className="pill" style={{ background: OWNERS[node.owner].color }}>
          {OWNERS[node.owner].label}
        </span>
        <span className="dtitle">{node.name}</span>
        <button className="linkish dtoggle" type="button" onClick={onToggle}>
          {open ? "hide details ▾" : summary ? `${summary} ▴` : "details ▴"}
        </button>
      </div>
      <div className="acts">{children}</div>

      <div className="dbody" aria-hidden={!open}>
        {open && (
          <>
            {err && (
              <div className="err" style={{ marginTop: 0 }}>
                {err}{" "}
                <button className="linkish" type="button" onClick={() => setErr(null)}>
                  dismiss
                </button>
              </div>
            )}
            <div className="dgrid">
              <Notes key={node.id} implId={implId} nodeId={node.id} value={d.notes} />
              <div className="dcol">
                <Links implId={implId} nodeId={node.id} links={d.links} onError={onError} />
                <Files
                  ownerUid={ownerUid}
                  implId={implId}
                  nodeId={node.id}
                  attachments={d.attachments}
                  onError={onError}
                />
              </div>
              <Comments implId={implId} nodeId={node.id} user={user} comments={d.comments} onError={onError} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
