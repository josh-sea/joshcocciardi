import React, { useEffect, useMemo, useRef, useState } from "react";
import Chip, { KindDot } from "./Chip";
import { makePick, samePick, splitItems } from "./plan";

/* The chooser behind the + on every slot. It picks several things at once:
   tapping an option adds it, tapping it again takes it off, and every change
   saves as it happens, so Done only closes the sheet.

   `sources` says what a slot may draw from (see SECTIONS in plan.js), and
   `allowText` whether a typed-in meal is fine. Typing "goldfish, meat stick"
   is treated as two things: known ones get selected, and anything new can be
   added to Inventory or Recipes on the spot. */
export default function PickSheet({
  title,
  sub,
  items: initial,
  sources,
  recipes,
  inventory,
  allowText,
  onAddRecipe,
  onAddInventory,
  onChange,
  onNone,
  onClose,
}) {
  const [items, setItems] = useState(initial);
  const latest = useRef(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The sheet keeps its own copy while open, so quick taps build on each
  // other instead of on whatever the last snapshot happened to hold.
  const commit = (next) => {
    latest.current = next;
    setItems(next);
    onChange(next);
  };
  const has = (p) => items.some((x) => samePick(x, p));
  const remove = (p) => commit(latest.current.filter((x) => !samePick(x, p)));
  const toggle = (p) => (latest.current.some((x) => samePick(x, p)) ? remove(p) : commit([...latest.current, p]));

  const all = useMemo(() => {
    const rows = [];
    if (sources.includes("recipe")) recipes.forEach((r) => rows.push(makePick("recipe", r.id, r.name)));
    if (sources.includes("inventory")) inventory.forEach((i) => rows.push(makePick("inventory", i.id, i.name)));
    return rows;
  }, [sources, recipes, inventory]);

  // Everything typed, split the same way inventory entry splits. The last
  // piece drives the search, so "goldfish, me" is already narrowing to meat
  // stick.
  const pieces = useMemo(() => splitItems(q), [q]);
  const needle = (q.split(/[,;\n]/).pop() || "").trim().toLowerCase();
  const options = useMemo(
    () => (needle ? all.filter((o) => o.name.toLowerCase().includes(needle)) : all).slice(0, 60),
    [all, needle]
  );
  const known = (name) => all.find((o) => o.name.toLowerCase() === name.toLowerCase());
  const unknown = pieces.filter((n) => !known(n));
  const matched = pieces.map(known).filter(Boolean);

  // Selects every known piece plus the new ones once `make` has given them
  // ids, then clears the box for the next thing.
  const settle = async (make) => {
    if (busy) return;
    setBusy(true);
    try {
      const made = make ? await make(unknown) : [];
      const next = [...latest.current];
      [...matched, ...made].forEach((p) => {
        if (!next.some((x) => samePick(x, p))) next.push(p);
      });
      commit(next);
      setQ("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const addAsText = () => settle(async (names) => names.map((n) => makePick("text", null, n)));
  const addToInventory = () =>
    settle(async (names) => {
      const ids = await onAddInventory(names);
      return names.map((n, i) => makePick("inventory", ids[i], n));
    });
  const addToRecipes = () =>
    settle(async (names) => Promise.all(names.map(async (n) => makePick("recipe", await onAddRecipe(n), n))));

  const submit = (e) => {
    e.preventDefault();
    if (!pieces.length) return;
    if (!unknown.length) return settle(null);
    if (allowText) return addAsText();
    if (sources.includes("inventory") && onAddInventory) return addToInventory();
  };

  const n = unknown.length;
  const what = n === 1 ? `“${unknown[0]}”` : `${n} new`;
  const emptyLabel =
    sources.length === 2 ? "No recipes or inventory yet." : sources[0] === "recipe" ? "No recipes yet." : "Nothing in stock.";

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheetx" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <div>
            <div className="sheettitle">{title}</div>
            {sub && <div className="muted small">{sub}</div>}
          </div>
          <button className="btn small" type="button" onClick={onClose}>
            Done
          </button>
        </div>

        {items.length > 0 && (
          <div className="chipline">
            {items.map((p) => (
              <Chip key={`${p.kind}:${p.id || p.name}`} pick={p} onRemove={() => remove(p)} />
            ))}
          </div>
        )}

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={allowText ? "Search, or type anything" : "Search, or type to add"}
            enterKeyHint="done"
            autoComplete="off"
          />
        </form>

        {n > 0 && (
          <div className="sheetacts">
            {allowText && (
              <button type="button" className="chipbtn" disabled={busy} onClick={addAsText}>
                Use {what} as typed
              </button>
            )}
            {sources.includes("inventory") && onAddInventory && (
              <button type="button" className="chipbtn" disabled={busy} onClick={addToInventory}>
                + Add {what} to Inventory
              </button>
            )}
            {sources.includes("recipe") && onAddRecipe && (
              <button type="button" className="chipbtn" disabled={busy} onClick={addToRecipes}>
                + Add {what} to Recipes
              </button>
            )}
          </div>
        )}

        {(options.length > 0 || !q.trim()) && (
        <div className="optlist">
          {options.length === 0 && <div className="muted small pad">{emptyLabel}</div>}
          {options.map((o) => {
            const on = has(o);
            return (
              <button
                key={`${o.kind}:${o.id}`}
                type="button"
                className={`opt ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => toggle(o)}
              >
                <span className="optname">
                  <KindDot kind={o.kind} />
                  {o.name}
                </span>
                <span className="optcheck" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
        )}

        {onNone && (
          <div className="sheetfoot">
            <button
              type="button"
              className="chipbtn"
              onClick={() => {
                onNone();
                onClose();
              }}
            >
              Not needed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
