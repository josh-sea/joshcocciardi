import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODELS, ClaudeError, DEFAULT_MODEL, formatCost, listModels, modelById, streamMessage } from "./claude";
import { cleanKey, looksLikeKey, maskKey, readKey, writeKey } from "./apikey";

// ---------------------------------------------------------------------------
// The Claude sidebar: a chat that can see whichever tab you are looking at.
//
// Two things it deliberately does not do. It never sends the API key anywhere
// but Anthropic — not to Firestore, not to this site's functions. And it never
// silently spends: every turn reports its own token usage and estimated cost,
// and the session total sits in the header.
// ---------------------------------------------------------------------------

const WIDTH_KEY = "sd.sidebarWidth.v1";
const MIN_W = 320;
const MAX_W = 900;

const SYSTEM = `You are a fantasy football assistant embedded in a tool called Sunday Desk, which reads the user's real ESPN league.

When the user attaches tab data, it is the live state of their league: rosters, matchups, projections, the waiver wire. Treat it as ground truth over anything you remember about players or schedules — your training data is older than this season.

Be concrete and short. Name players, give numbers. If the attached data does not contain what you would need to answer, say so rather than guessing. Half-PPR and roster-slot rules vary by league, so check the attached settings before assuming scoring.`;

const readWidth = () => {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= MIN_W && n <= MAX_W ? n : 420;
  } catch (e) {
    return 420;
  }
};

export default function Sidebar({ open, onClose, context }) {
  const [width, setWidth] = useState(readWidth);
  const [apiKey, setApiKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [available, setAvailable] = useState(null); // null = not checked yet
  const [checking, setChecking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [attach, setAttach] = useState(true);

  const [turns, setTurns] = useState([]); // {role, text, usage?, cost?, searched?}
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  const sessionCost = useMemo(() => turns.reduce((n, t) => n + (t.cost || 0), 0), [turns]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch (e) {
      /* width is a convenience, not worth surfacing a failure for */
    }
  }, [width]);

  /* The panel is fixed, so the page underneath has to be told how much room it
     lost or the sidebar sits on top of the roster. Published as a custom
     property because the width lives in React state but the gutter is applied
     by `.sd.withbar` in the stylesheet. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sd-barw", open ? `${width}px` : "0px");
    return () => root.style.removeProperty("--sd-barw");
  }, [open, width]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, busy]);

  /* Ask the key which models it can actually reach, rather than offering four
     and letting two of them 404. Fable in particular is not on every account. */
  const checkModels = useCallback(
    async (key) => {
      if (!key) return;
      setChecking(true);
      setError(null);
      try {
        const rows = await listModels(key);
        setAvailable(rows);
        if (!rows.some((m) => m.id === model)) setModel(rows[0]?.id || DEFAULT_MODEL);
      } catch (e) {
        setAvailable([]);
        setError(e.message);
      } finally {
        setChecking(false);
      }
    },
    [model]
  );

  useEffect(() => {
    if (apiKey && available === null) checkModels(apiKey);
  }, [apiKey, available, checkModels]);

  // ---- resize ------------------------------------------------------------
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const next = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - x));
      setWidth(next);
    };
    const up = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  }, []);

  // ---- send --------------------------------------------------------------
  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !apiKey) return;
    setError(null);
    setDraft("");

    // The tab's data rides along as its own block so the model can tell the
    // user's words apart from the dump, and so turning the toggle off is a
    // clean removal rather than a prompt edit.
    const content = [];
    if (attach && context?.payload) {
      content.push({
        type: "text",
        text: `Live data from the ${context.label} tab of my league:\n\n\`\`\`json\n${JSON.stringify(
          context.payload
        ).slice(0, 120000)}\n\`\`\``,
      });
    }
    content.push({ type: "text", text });

    const history = turns
      .filter((t) => !t.error)
      .map((t) => ({ role: t.role, content: t.text }));
    const next = [...history, { role: "user", content }];

    setTurns((prev) => [
      ...prev,
      { role: "user", text, attached: attach && Boolean(context?.payload) },
      { role: "assistant", text: "", streaming: true },
    ]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await streamMessage({
        apiKey,
        model,
        system: SYSTEM,
        messages: next,
        webSearch,
        signal: controller.signal,
        onDelta: (chunk) =>
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.streaming) copy[copy.length - 1] = { ...last, text: last.text + chunk };
            return copy;
          }),
        onSearch: () =>
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.streaming) copy[copy.length - 1] = { ...last, searched: true };
            return copy;
          }),
      });
      setTurns((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          streaming: false,
          usage: result.usage,
          cost: result.cost,
        };
        return copy;
      });
    } catch (e) {
      const message = e.name === "AbortError" ? "Stopped." : e.message;
      setTurns((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", text: message, error: true, streaming: false };
        return copy;
      });
      if (e instanceof ClaudeError && e.kind === "auth") setAvailable(null);
      setError(e.name === "AbortError" ? null : message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  if (!open) return null;

  const models = available && available.length ? available : MODELS;

  return (
    <aside className="sdbar" style={{ width }}>
      <div
        className="grip"
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.userSelect = "none";
        }}
        onTouchStart={() => {
          dragging.current = true;
        }}
        title="Drag to resize"
      />
      <div className="sdbar-head">
        <b>Ask Claude</b>
        <span className="spend" title="Estimated from token usage at list prices">
          {formatCost(sessionCost)} this session
        </span>
        <button className="x" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {!apiKey ? (
        <div className="sdbar-body">
          <div className="card">
            <h3>Add your Anthropic API key</h3>
            <p className="muted">
              It's stored on this device only and sent straight to Anthropic — never to this site's
              server or database. That means your phone needs its own key, because there's nothing
              to sync. Get one at <b>console.anthropic.com</b>.
            </p>
            <label className="field">
              <span className="flabel">API key</span>
              <input
                className="input mono"
                type="password"
                value={keyDraft}
                placeholder="sk-ant-..."
                spellCheck="false"
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </label>
            {keyDraft && !looksLikeKey(keyDraft) && (
              <div className="err">
                Anthropic keys start <b>sk-ant-</b>. Paste the whole key, including that prefix.
              </div>
            )}
            <button
              className="btn"
              type="button"
              disabled={!looksLikeKey(keyDraft)}
              onClick={() => {
                const v = cleanKey(keyDraft);
                writeKey(v);
                setApiKey(v);
                setKeyDraft("");
                setAvailable(null);
              }}
            >
              Save on this device
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sdbar-tools">
            <select className="msel" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={"chip" + (attach ? " on" : "")}
              onClick={() => setAttach((v) => !v)}
              title={context?.payload ? `Attach the ${context.label} tab's data` : "Nothing loaded to attach"}
              disabled={!context?.payload}
            >
              {context?.label || "no tab"}
            </button>
            <button
              type="button"
              className={"chip" + (webSearch ? " on" : "")}
              onClick={() => setWebSearch((v) => !v)}
              title="Let Claude search the web (costs extra)"
            >
              web
            </button>
          </div>
          <div className="modelnote">{modelById(model).blurb}</div>

          <div className="sdbar-body" ref={scrollRef}>
            {turns.length === 0 && (
              <p className="muted pad">
                Ask about the tab you're on. "Who should I start over Skattebo this week?" or "find
                me a kicker for week 7".
                {checking ? " Checking which models your key can use…" : ""}
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={"turn " + t.role + (t.error ? " bad" : "")}>
                <div className="who">{t.role === "user" ? "you" : modelById(model).label}</div>
                <div className="msg">
                  {t.text || (t.streaming ? "…" : "")}
                  {t.streaming && <span className="caret" />}
                </div>
                <div className="meta">
                  {t.attached && <span className="tagchip">sent {context?.label} data</span>}
                  {t.searched && <span className="tagchip">searched the web</span>}
                  {t.usage && (
                    <span className="tagchip">
                      {t.usage.input_tokens || 0} in · {t.usage.output_tokens || 0} out ·{" "}
                      {formatCost(t.cost)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="sdbar-err">{error}</div>}

          <div className="sdbar-input">
            <textarea
              rows={2}
              value={draft}
              placeholder="Ask about this tab…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <button className="btn" type="button" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            ) : (
              <button className="btn" type="button" disabled={!draft.trim()} onClick={send}>
                Send
              </button>
            )}
          </div>
          <div className="sdbar-foot">
            key {maskKey(apiKey)} on this device ·{" "}
            <button
              className="linkish"
              type="button"
              onClick={() => {
                if (!window.confirm("Remove the API key from this device?")) return;
                writeKey(null);
                setApiKey(null);
                setAvailable(null);
                setTurns([]);
              }}
            >
              remove
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
