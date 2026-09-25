import React, { useEffect, useMemo, useRef, useState } from "react";
import Anthropic from "@anthropic-ai/sdk";
import { cleanKey, maskKey, readKey, writeKey } from "../sunday-desk/apikey";
import { MODELS, capabilities, estimateCost, formatCost } from "../sunday-desk/claude";
import Chip from "./Chip";
import {
  CONTEXTS,
  TOOLS,
  buildContext,
  buyRows,
  isContextBlock,
  recipeToSave,
  systemPrompt,
  validateListItems,
  validateRecipe,
} from "./assistant";
import { makePick, mondayOf, todayKey } from "./plan";
import { addRecipe, listItems, watchWeek } from "./store";

// ---------------------------------------------------------------------------
// Ask AI: a chat with Claude about this kitchen.
//
// Runs in the browser with the user's own Anthropic key, the same key Sunday
// Desk stores on this device (never in Firestore; see ../sunday-desk/apikey).
// The model is told what the user ticks (recipes, inventory, shopping list,
// today or this week) and can do two things back:
//   propose_recipe         shows a recipe card: Save recipe, and add the
//                          missing ingredients to the shopping list
//   add_to_shopping_list   adds what the user asked for, right away
// plus web search when the globe is on.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-opus-5";
// Models whose safety classifiers can decline a request. For these the
// request opts into server-side fallback, which re-runs a declined turn on
// the model Anthropic recommends for that kind of decline.
const FALLBACK_MODELS = new Set(["claude-opus-5", "claude-fable-5-1"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const PREFS = "mealplan.ai.v1";
const readPrefs = () => {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS) || "{}");
  } catch (e) {
    return {};
  }
};
const writePrefs = (p) => {
  try {
    window.localStorage.setItem(PREFS, JSON.stringify(p));
  } catch (e) {
    /* private mode: preferences just won't stick */
  }
};

// The conversation is kept on this device, per kitchen, so closing the
// panel doesn't lose it. If it grows past what storage will take, it simply
// stops being saved; the open conversation is unaffected.
const chatKey = (hid) => `mealplan.chat.${hid}`;
const readChat = (hid) => {
  try {
    const c = JSON.parse(window.localStorage.getItem(chatKey(hid)) || "null");
    return c && Array.isArray(c.messages) ? c : null;
  } catch (e) {
    return null;
  }
};
const writeChat = (hid, chat) => {
  try {
    if (chat) window.localStorage.setItem(chatKey(hid), JSON.stringify(chat));
    else window.localStorage.removeItem(chatKey(hid));
  } catch (e) {
    /* quota or private mode */
  }
};

const explainError = (e) => {
  if (e instanceof Anthropic.AuthenticationError) return "That API key was rejected. Check it under the key icon.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This key isn't allowed to use that model. Try another one.";
  if (e instanceof Anthropic.RateLimitError) return "Anthropic is rate limiting this key. Wait a moment and try again.";
  if (e instanceof Anthropic.BadRequestError) return e.message || "Anthropic rejected the request.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check the connection and try again.";
  if (e instanceof Anthropic.APIError) return e.message || `Anthropic returned ${e.status}.`;
  return e?.message || String(e);
};

/* ---------------------------- rendering ---------------------------- */

// Just enough markdown for chat answers: paragraphs, bullet and numbered
// lists, and **bold**. Built as React elements, never as HTML.
const inline = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );

function Markdown({ text }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks.map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      const ordered = /^\s*\d/.test(lines[0]);
      const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
      return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
    }
    const heading = lines.length === 1 && /^#{1,4}\s/.test(lines[0]);
    if (heading) return <p key={i} className="mdhead">{inline(lines[0].replace(/^#+\s*/, ""))}</p>;
    return (
      <p key={i}>
        {lines.map((l, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

/* A recipe the assistant proposed. Save recipe adds it to the recipe box,
   with its inventory items linked. The to-buy list starts with everything
   ticked except what's already in stock or already on the list. */
function RecipeCard({ recipe, state, inventory, onSave, onList }) {
  const rows = useMemo(() => buyRows(recipe, inventory), [recipe, inventory]);
  const [picked, setPicked] = useState(() => rows.map((r) => !r.inStock && !r.onList));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = rows.filter((r, i) => picked[i]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aicard">
      <div className="aicardhead">
        <span className="chip recipe">{recipe.name}</span>
        {recipe.servings && <span className="muted small">serves {recipe.servings}</span>}
        {recipe.sourceUrl && (
          <a className="small" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
            source ↗
          </a>
        )}
      </div>
      <button type="button" className="linkish" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide recipe" : `Show recipe (${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps)`}
      </button>
      {open && (
        <div className="aicardbody">
          <ul>
            {recipe.ingredients.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <ol>
            {recipe.steps.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </div>
      )}
      {recipe.usesInventory.length > 0 && (
        <div className="chipline">
          <span className="muted small">Uses from inventory:</span>
          {recipe.usesInventory.map((n) => (
            <Chip key={n} pick={makePick("inventory", n, n)} />
          ))}
        </div>
      )}
      <button className="btn small" type="button" disabled={busy || state.recipeId} onClick={() => run(onSave)}>
        {state.recipeId ? "✓ Saved to Recipes" : "Save recipe"}
      </button>

      {rows.length > 0 && (
        <div className="aibuy">
          <div className="flabel" style={{ margin: "12px 0 4px" }}>
            To buy
          </div>
          {rows.map((r, i) => (
            <label key={r.name} className="aibuyrow">
              <input
                type="checkbox"
                checked={picked[i]}
                disabled={state.listed}
                onChange={() => setPicked(picked.map((p, j) => (j === i ? !p : p)))}
              />
              <span>
                {r.name}
                {r.amount && <span className="muted"> · {r.amount}</span>}
                {r.inStock && <span className="tag list">in stock</span>}
                {r.onList && <span className="tag list">on list</span>}
              </span>
            </label>
          ))}
          <button
            className="btn small ghost"
            type="button"
            disabled={busy || state.listed || !chosen.length}
            onClick={() => run(() => onList(chosen))}
          >
            {state.listed ? `✓ Added ${state.listed} to the list` : `Add ${chosen.length} to shopping list`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ the panel ----------------------------- */

export default function Chat({ hid, user, household, config, recipes, inventory, onClose }) {
  const [apiKey, setApiKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const saved = useMemo(() => readChat(hid), [hid]);
  const [chat, setChat] = useState(() => saved || { messages: [], cards: {}, lastContext: "", cost: 0 });
  const prefs = useMemo(readPrefs, []);
  const [model, setModel] = useState(prefs.model || DEFAULT_MODEL);
  const [web, setWeb] = useState(!!prefs.web);
  const [picked, setPicked] = useState(prefs.picked || ["inventory", "today"]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [days, setDays] = useState({});
  const streamRef = useRef(null);
  const endRef = useRef(null);
  const chatRef = useRef(chat);

  const today = todayKey();
  useEffect(() => watchWeek(hid, mondayOf(today), setDays, () => {}), [hid, today]);
  useEffect(() => writePrefs({ model, web, picked }), [model, web, picked]);
  useEffect(() => {
    chatRef.current = chat;
    if (!busy) writeChat(hid, chat.messages.length ? chat : null);
  }, [chat, busy, hid]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [chat, live, status]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const update = (fn) => {
    chatRef.current = fn(chatRef.current);
    setChat(chatRef.current);
  };

  const setCard = (id, patch) =>
    update((c) => ({ ...c, cards: { ...c.cards, [id]: { ...(c.cards[id] || {}), ...patch } } }));

  const saveKey = () => {
    const k = cleanKey(keyDraft);
    if (!k) return;
    writeKey(k);
    setApiKey(k);
    setKeyDraft("");
    setShowKey(false);
  };

  // Runs one tool call and returns its tool_result. Inputs are validated
  // first: with eager input streaming the API no longer does that.
  const runTool = async (block) => {
    if (block.name === "propose_recipe") {
      const v = validateRecipe(block.input);
      if (!v.ok) return { type: "tool_result", tool_use_id: block.id, is_error: true, content: v.error };
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content:
          "Shown to the user as a recipe card with the ingredients and method, a Save recipe button, and the to_buy list with an Add to shopping list button. Nothing has been saved or added yet; that's up to them.",
      };
    }
    if (block.name === "add_to_shopping_list") {
      const v = validateListItems(block.input);
      if (!v.ok) return { type: "tool_result", tool_use_id: block.id, is_error: true, content: v.error };
      await listItems(hid, user.uid, v.value, inventory);
      setCard(block.id, { listed: v.value.length });
      const names = v.value.map((x) => (x.amount ? `${x.name} (${x.amount})` : x.name)).join(", ");
      return { type: "tool_result", tool_use_id: block.id, content: `Added to the shopping list: ${names}.` };
    }
    return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `Unknown tool ${block.name}.` };
  };

  const send = async (e) => {
    e?.preventDefault();
    const question = draft.trim();
    if (!question || busy || !apiKey) return;
    setDraft("");
    setError(null);
    setBusy(true);

    // The kitchen context goes in with the question, and only when it has
    // changed since it was last sent, so a follow-up doesn't resend it all.
    const context = buildContext({
      picked,
      todayKey: today,
      recipes,
      inventory,
      days,
      config,
      people: config.active,
    });
    const content = [];
    if (context !== chatRef.current.lastContext) content.push({ type: "text", text: context });
    content.push({ type: "text", text: question });
    update((c) => ({ ...c, lastContext: context, messages: [...c.messages, { role: "user", content }] }));

    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const caps = capabilities(model);
    const tools = [...TOOLS];
    if (web) tools.push({ type: caps.webSearchType, name: "web_search", max_uses: 5 });

    let badJson = 0;
    try {
      for (;;) {
        const params = {
          model,
          max_tokens: 64000,
          system: systemPrompt(household.name, config.active),
          tools,
          messages: chatRef.current.messages,
          cache_control: { type: "ephemeral" },
        };
        if (caps.adaptiveThinking === true) params.thinking = { type: "adaptive" };
        // Medium keeps a kitchen chat quick; the default is high.
        if (caps.effort) params.output_config = { effort: "medium" };
        if (FALLBACK_MODELS.has(model)) {
          params.betas = [FALLBACK_BETA];
          params.fallbacks = "default";
        }

        setLive("");
        setStatus("");
        const stream = client.beta.messages.stream(params);
        streamRef.current = stream;
        stream.on("text", (delta) => {
          setStatus("");
          setLive((t) => t + delta);
        });
        stream.on("streamEvent", (evt) => {
          if (evt.type === "content_block_start" && evt.content_block?.type === "server_tool_use") {
            setStatus("Searching the web…");
          } else if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use") {
            setStatus(evt.content_block.name === "propose_recipe" ? "Writing up a recipe…" : "Updating your list…");
          }
        });

        let message;
        try {
          message = await stream.finalMessage();
          badJson = 0;
        } catch (err) {
          // A tool input that couldn't be parsed at all rejects here; retry
          // that turn a couple of times. Anything from the API is real.
          if (err instanceof Anthropic.APIError || err?.name === "AbortError" || badJson++ >= 2) throw err;
          continue;
        }
        setLive("");
        update((c) => ({ ...c, cost: (c.cost || 0) + estimateCost(model, message.usage) }));

        if (message.stop_reason === "refusal") {
          setError("The model declined to answer that one. Try rephrasing.");
          break;
        }
        const toolUses = message.content.filter((b) => b.type === "tool_use");
        if (message.stop_reason === "max_tokens" && toolUses.length) {
          setError("That answer ran too long to finish. Try asking for something smaller.");
          break;
        }
        update((c) => ({ ...c, messages: [...c.messages, { role: "assistant", content: message.content }] }));
        // Web search hit its step limit mid-turn; send it back to carry on.
        if (message.stop_reason === "pause_turn") continue;
        if (!toolUses.length) break;

        const results = [];
        for (const block of toolUses) {
          try {
            results.push(await runTool(block));
          } catch (err) {
            results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: explainError(err) });
          }
        }
        update((c) => ({ ...c, messages: [...c.messages, { role: "user", content: results }] }));
      }
    } catch (err) {
      if (err?.name !== "AbortError" && !(err instanceof Anthropic.APIUserAbortError)) setError(explainError(err));
    } finally {
      streamRef.current = null;
      setLive("");
      setStatus("");
      setBusy(false);
    }
  };

  const stop = () => streamRef.current?.abort();

  const reset = () => {
    if (busy) return;
    update(() => ({ messages: [], cards: {}, lastContext: "", cost: 0 }));
    setError(null);
  };

  const togglePick = (key) => {
    setPicked((p) => {
      if (p.includes(key)) return p.filter((k) => k !== key);
      // Today and This week overlap; picking one drops the other.
      const without = key === "week" ? p.filter((k) => k !== "today") : key === "today" ? p.filter((k) => k !== "week") : p;
      return [...without, key];
    });
  };

  // Everything the conversation shows, in order, built from the stored API
  // messages so a reload renders exactly what was said.
  const rendered = [];
  chat.messages.forEach((m, mi) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "user") {
      const text = blocks
        .filter((b) => b.type === "text" && !isContextBlock(b.text))
        .map((b) => b.text)
        .join("\n");
      if (text) rendered.push(<div key={`u${mi}`} className="bubble me">{text}</div>);
      return;
    }
    blocks.forEach((b, bi) => {
      const key = `a${mi}.${bi}`;
      if (b.type === "text" && b.text.trim()) {
        rendered.push(
          <div key={key} className="bubble ai">
            <Markdown text={b.text} />
          </div>
        );
      } else if (b.type === "server_tool_use" && b.name === "web_search") {
        rendered.push(
          <div key={key} className="aistatus">
            🔎 Searched the web{b.input?.query ? `: ${b.input.query}` : ""}
          </div>
        );
      } else if (b.type === "tool_use" && b.name === "propose_recipe") {
        const v = validateRecipe(b.input);
        if (!v.ok) return;
        const state = chat.cards[b.id] || {};
        rendered.push(
          <RecipeCard
            key={key}
            recipe={v.value}
            state={state}
            inventory={inventory}
            onSave={async () => {
              const id = await addRecipe(hid, user.uid, recipeToSave(v.value, inventory));
              setCard(b.id, { recipeId: id });
            }}
            onList={async (rows) => {
              await listItems(
                hid,
                user.uid,
                rows.map((r) => ({ name: r.name, amount: r.amount })),
                inventory
              );
              setCard(b.id, { listed: rows.length });
            }}
          />
        );
      } else if (b.type === "tool_use" && b.name === "add_to_shopping_list") {
        const v = validateListItems(b.input);
        if (!v.ok || !chat.cards[b.id]?.listed) return;
        rendered.push(
          <div key={key} className="aistatus ok">
            🛒 Added to the shopping list: {v.value.map((x) => (x.amount ? `${x.name} (${x.amount})` : x.name)).join(", ")}
          </div>
        );
      }
    });
  });

  const needKey = !apiKey || showKey;

  return (
    <div className="scrim chatscrim" onClick={() => !busy && onClose()}>
      <div className="chatsheet" role="dialog" aria-label="Ask AI" onClick={(e) => e.stopPropagation()}>
        <div className="chathead">
          <div className="sheettitle">Ask AI</div>
          <div className="chattools">
            <select className="chatmodel" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button className="iconbtn" type="button" aria-label="API key" title="API key" onClick={() => setShowKey(!showKey)}>
              🔑
            </button>
            <button className="iconbtn" type="button" aria-label="New chat" title="New chat" disabled={busy} onClick={reset}>
              ↺
            </button>
            <button className="iconbtn" type="button" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {needKey ? (
          <form
            className="chatkey"
            onSubmit={(e) => {
              e.preventDefault();
              saveKey();
            }}
          >
            <p className="muted small">
              Ask AI uses your own Anthropic API key, the same one Sunday Desk uses. It's kept on this device only, never
              saved to the kitchen, so each phone needs it entered once. Get one at console.anthropic.com.
            </p>
            {apiKey && <p className="small">Current key: {maskKey(apiKey)}</p>}
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="sk-ant-…"
              aria-label="Anthropic API key"
            />
            <div className="row gap">
              <button className="btn small" type="submit" disabled={!cleanKey(keyDraft)}>
                Save key
              </button>
              {apiKey && (
                <button
                  className="btn small ghost"
                  type="button"
                  onClick={() => {
                    writeKey("");
                    setApiKey(null);
                  }}
                >
                  Remove key
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className="chatlog">
              {!rendered.length && !busy && (
                <div className="muted small pad">
                  Ask about dinner ideas, using up what's in the fridge, or say "add 2 lemons to the list". Tick what the
                  assistant can see below.
                </div>
              )}
              {rendered}
              {live && (
                <div className="bubble ai">
                  <Markdown text={live} />
                </div>
              )}
              {busy && !live && <div className="aistatus">{status || "Thinking…"}</div>}
              {error && <div className="err">{error}</div>}
              <div ref={endRef} />
            </div>

            <div className="chatfoot">
              <div className="chatctx" role="group" aria-label="What the assistant can see">
                {CONTEXTS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`chipbtn toggle ${picked.includes(c.key) ? "on" : ""}`}
                    aria-pressed={picked.includes(c.key)}
                    onClick={() => togglePick(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`chipbtn toggle ${web ? "on" : ""}`}
                  aria-pressed={web}
                  onClick={() => setWeb(!web)}
                  title="Let it search the web"
                >
                  🌐 Web
                </button>
              </div>
              <form className="chatin" onSubmit={send}>
                <textarea
                  className="input"
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) send(e);
                  }}
                  placeholder="What should we have for dinner?"
                  aria-label="Message"
                />
                {busy ? (
                  <button className="btn small ghost" type="button" onClick={stop}>
                    Stop
                  </button>
                ) : (
                  <button className="btn small" type="submit" disabled={!draft.trim()}>
                    Send
                  </button>
                )}
              </form>
              {chat.cost > 0 && <div className="muted small chatcost">This chat so far: about {formatCost(chat.cost)}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
