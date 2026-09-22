import React, { useEffect, useMemo, useRef, useState } from "react";
import { makePick } from "./plan";

/* The chooser behind every slot on the weekly plan. A bottom sheet rather
   than a dropdown, because it's used on a phone at the counter far more than
   at a desk.

   `sources` says where a slot may draw from, per the spec: dinner is recipes
   only, snacks are inventory only, dessert is either, and breakfast and lunch
   take either plus anything typed in. When the thing you want isn't there
   yet, the sheet offers to add it to Recipes or Inventory on the spot, so
   planning never means leaving the page. */
export default function PickSheet({
  title,
  sub,
  value,
  clearable,
  sources,
  recipes,
  inventory,
  allowText,
  onAddRecipe,
  onAddInventory,
  onPick,
  onNone,
  onClose,
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = [];
    if (sources.includes("recipe")) recipes.forEach((r) => rows.push(makePick("recipe", r.id, r.name)));
    if (sources.includes("inventory")) inventory.forEach((i) => rows.push(makePick("inventory", i.id, i.name)));
    const hits = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
    return hits.slice(0, 40);
  }, [q, sources, recipes, inventory]);

  const typed = q.trim();
  const exact = options.some((o) => o.name.toLowerCase() === typed.toLowerCase());

  const choose = (pick) => {
    onPick(pick);
    onClose();
  };

  const addAnd = async (fn, kind) => {
    if (!typed || busy) return;
    setBusy(true);
    try {
      const id = await fn(typed);
      choose(makePick(kind, id, typed));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (options.length === 1) return choose(options[0]);
    const match = options.find((o) => o.name.toLowerCase() === typed.toLowerCase());
    if (match) return choose(match);
    if (typed && allowText) choose(makePick("text", null, typed));
  };

  const emptyLabel =
    sources.length === 2 ? "No recipes or inventory yet." : sources[0] === "recipe" ? "No recipes yet." : "Inventory is empty.";

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheetx" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <div>
            <div className="sheettitle">{title}</div>
            {sub && <div className="muted small">{sub}</div>}
          </div>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={allowText ? "Search, or type anything" : "Search"}
            enterKeyHint="done"
          />
        </form>

        <div className="optlist">
          {options.length === 0 && !typed && <div className="muted small pad">{emptyLabel}</div>}
          {options.map((o) => {
            const on = value && value.kind === o.kind && value.id === o.id;
            return (
              <button key={`${o.kind}:${o.id}`} type="button" className={`opt ${on ? "on" : ""}`} onClick={() => choose(o)}>
                <span>{o.name}</span>
                {sources.length > 1 && <span className={`tag ${o.kind}`}>{o.kind === "recipe" ? "recipe" : "inventory"}</span>}
              </button>
            );
          })}
        </div>

        {typed && !exact && (
          <div className="sheetacts">
            {allowText && (
              <button type="button" className="chipbtn" onClick={() => choose(makePick("text", null, typed))}>
                Use “{typed}”
              </button>
            )}
            {onAddRecipe && (
              <button type="button" className="chipbtn" disabled={busy} onClick={() => addAnd(onAddRecipe, "recipe")}>
                + Add “{typed}” to Recipes
              </button>
            )}
            {onAddInventory && (
              <button type="button" className="chipbtn" disabled={busy} onClick={() => addAnd(onAddInventory, "inventory")}>
                + Add “{typed}” to Inventory
              </button>
            )}
          </div>
        )}

        <div className="sheetfoot">
          {onNone && (
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
          )}
          {(value || clearable) && (
            <button type="button" className="chipbtn quiet" onClick={() => choose(null)}>
              {onNone ? "Back to undecided" : "Clear"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
