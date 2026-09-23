import React, { useMemo, useState } from "react";
import Chip from "./Chip";
import { itemState, makePick, splitItems } from "./plan";

/* Links a recipe to the inventory items it uses, so eating it can ask about
   each one. Type to find an item and tap it; anything typed that isn't in
   inventory yet can be added on the spot. Typing "pasta, pesto" is two. */
export default function InventoryLink({ value, onChange, inventory, onAddInventory }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const linked = (id) => value.some((u) => u.id === id);
  const known = useMemo(() => inventory.filter((i) => itemState(i) !== "wanted"), [inventory]);
  const needle = (q.split(/[,;\n]/).pop() || "").trim().toLowerCase();
  const suggestions = needle
    ? known.filter((i) => !linked(i.id) && i.name.toLowerCase().includes(needle)).slice(0, 6)
    : [];
  const pieces = splitItems(q);
  const find = (name) => known.find((i) => i.name.toLowerCase() === name.toLowerCase());
  const unknown = pieces.filter((n) => !find(n));

  const link = (items) => {
    const next = [...value];
    items.forEach((i) => {
      if (!next.some((u) => u.id === i.id)) next.push({ id: i.id, name: i.name });
    });
    onChange(next);
  };

  // Links every known piece, adds the unknown ones to inventory first.
  const settle = async () => {
    if (busy || !pieces.length) return;
    setBusy(true);
    try {
      const ids = unknown.length ? await onAddInventory(unknown) : [];
      link([...pieces.map(find).filter(Boolean), ...unknown.map((name, i) => ({ id: ids[i], name }))]);
      setQ("");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (pieces.length === 1 && !find(pieces[0]) && suggestions.length === 1) {
      link(suggestions);
      setQ("");
    } else settle();
  };

  return (
    <div className="linker">
      {value.length > 0 && (
        <div className="chipline">
          {value.map((u) => (
            <Chip
              key={u.id}
              pick={makePick("inventory", u.id, u.name)}
              onRemove={() => onChange(value.filter((x) => x.id !== u.id))}
            />
          ))}
        </div>
      )}
      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        placeholder="Search inventory, or type to add"
        autoComplete="off"
        enterKeyHint="done"
      />
      {(suggestions.length > 0 || unknown.length > 0) && (
        <div className="chipline">
          {suggestions.map((i) => (
            <button
              key={i.id}
              type="button"
              className="chipbtn"
              onClick={() => {
                link([i]);
                setQ("");
              }}
            >
              + {i.name}
            </button>
          ))}
          {unknown.length > 0 && (
            <button type="button" className="chipbtn" disabled={busy} onClick={settle}>
              + Add {unknown.length === 1 ? `“${unknown[0]}”` : `${unknown.length} new`} to Inventory
            </button>
          )}
        </div>
      )}
    </div>
  );
}
