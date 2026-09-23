import React, { useMemo, useState } from "react";
import { deleteItem, setUsed, stockItems } from "./store";
import { ageLabel, itemState, shortDate, sortItems, splitItems, toKey } from "./plan";

const HIDE_KEY = "mealplan.hideUsed";
const readHide = () => {
  try {
    return window.localStorage.getItem(HIDE_KEY) === "1";
  } catch (e) {
    return false;
  }
};

/* The running list of what's in the house: A to Z by default, or by the date
   it came in. Tap the circle when something runs out and it stays on the list
   struck through, which is what feeds the "used up" side of the shopping
   list. Adding a name that's already here (even struck through) brings that
   row back with today's date rather than adding a second one. */
export default function Inventory({ hid, user, inventory, onError }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState(null);
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [hideUsed, setHideUsed] = useState(readHide);

  const preview = useMemo(() => splitItems(text), [text]);
  const known = useMemo(() => inventory.filter((i) => itemState(i) !== "wanted"), [inventory]);
  const stockCount = known.filter((i) => itemState(i) === "stock").length;
  const usedCount = known.length - stockCount;

  const submit = async (e) => {
    e.preventDefault();
    if (!preview.length || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const n = (await stockItems(hid, user.uid, preview, inventory)).length;
      setText("");
      setNotice(`Added ${n} item${n === 1 ? "" : "s"}.`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleHide = () => {
    const next = !hideUsed;
    setHideUsed(next);
    try {
      window.localStorage.setItem(HIDE_KEY, next ? "1" : "0");
    } catch (e) {
      /* private mode: the choice just won't be remembered */
    }
  };

  // Tapping a header sorts by it; tapping the same header again flips it.
  const sortBy = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const arrow = (key) => (sort.key !== key ? "" : sort.dir === "asc" ? " ▲" : " ▼");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = known.filter(
      (i) => (!hideUsed || itemState(i) !== "used") && (!needle || i.name.toLowerCase().includes(needle))
    );
    return sortItems(hits, sort.key, sort.dir);
  }, [known, q, hideUsed, sort]);

  return (
    <div className="page">
      <div className="pagehead">
        <h2 className="h2">Inventory</h2>
        <span className="muted small">
          {stockCount} in stock{usedCount > 0 && ` · ${usedCount} used up`}
        </span>
      </div>

      <form className="card form" onSubmit={submit}>
        <label className="field" style={{ marginTop: 0 }}>
          <span className="flabel">Add items</span>
          <textarea
            className="input"
            rows={3}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setNotice(null);
            }}
            placeholder="milk, eggs, sourdough, mac and cheese"
          />
        </label>
        <div className="muted small" style={{ marginTop: 6 }}>
          Separate items with commas, semicolons, or new lines. Dictating? Say “comma” between items.
        </div>
        {preview.length > 0 && (
          <div className="chips">
            {preview.map((p) => (
              <span key={p} className="chip inventory">
                {p}
              </span>
            ))}
          </div>
        )}
        <button className="btn" type="submit" disabled={busy || !preview.length}>
          {busy ? "Adding…" : preview.length ? `Add ${preview.length} item${preview.length === 1 ? "" : "s"}` : "Add items"}
        </button>
        {notice && <div className="ok">{notice}</div>}
      </form>

      {known.length === 0 ? (
        <div className="empty">Nothing in inventory yet. Whatever you add here can fill snacks and desserts on the plan.</div>
      ) : (
        <>
          <div className="filters">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inventory" />
            {usedCount > 0 && (
              <button className={`chipbtn ${hideUsed ? "on" : ""}`} type="button" onClick={toggleHide} aria-pressed={hideUsed}>
                Hide used
              </button>
            )}
          </div>
          <div className="card list table">
            <div className="thead">
              <span className="tcheck" />
              <button type="button" className="th" onClick={() => sortBy("name")} aria-label="Sort by item">
                Item{arrow("name")}
              </button>
              <button type="button" className="th right" onClick={() => sortBy("added")} aria-label="Sort by date added">
                Added{arrow("added")}
              </button>
              <span className="tx" />
            </div>
            {rows.map((i) => {
              const used = itemState(i) === "used";
              return (
                <div key={i.id} className={`trow ${used ? "used" : ""}`}>
                  <button
                    className={`tick ${used ? "on" : ""}`}
                    type="button"
                    aria-pressed={used}
                    aria-label={used ? `${i.name} is used up. Tap to mark as still here.` : `Mark ${i.name} used up`}
                    onClick={() => setUsed(hid, i.id, !used).catch(onError)}
                  >
                    {used ? "✓" : ""}
                  </button>
                  <span className="iname">
                    {i.name}
                    {i.onList && <span className="tag list">on list</span>}
                  </span>
                  <span className="tdate" title={i.addedAt ? i.addedAt.toLocaleString() : ""}>
                    {i.addedAt ? shortDate(toKey(i.addedAt)) : ""}
                    <span className="muted">{ageLabel(i.addedAt)}</span>
                  </span>
                  <button
                    className="iconbtn quiet"
                    type="button"
                    aria-label={`Delete ${i.name}`}
                    title="Delete for good"
                    onClick={() => window.confirm(`Delete “${i.name}” for good?`) && deleteItem(hid, i.id).catch(onError)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            {rows.length === 0 && <div className="muted small pad">Nothing matches.</div>}
          </div>
          <div className="muted small pad">
            Tap the circle when something runs out. It stays here struck through, and shows up under Used up on the
            Shopping list.
          </div>
        </>
      )}
    </div>
  );
}
