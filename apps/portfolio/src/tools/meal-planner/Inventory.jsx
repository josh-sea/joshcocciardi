import React, { useMemo, useState } from "react";
import { addItems, deleteItem } from "./store";
import { ageLabel, splitItems } from "./plan";

/* Type or dictate a list, see how it splits, submit. Every row is a name and
   the moment it went in: no quantities, no locations, no expiry. The
   timestamp is kept so aging can be built on it later. */
export default function Inventory({ hid, user, inventory, onError }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState(null);

  const preview = useMemo(() => splitItems(text), [text]);

  const submit = async (e) => {
    e.preventDefault();
    if (!preview.length || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const n = await addItems(hid, user.uid, preview);
      setText("");
      setNotice(`Added ${n} item${n === 1 ? "" : "s"}.`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? inventory.filter((i) => i.name.toLowerCase().includes(needle)) : inventory;
  }, [inventory, q]);

  return (
    <div className="page">
      <div className="pagehead">
        <h2 className="h2">Inventory</h2>
        <span className="muted small">{inventory.length} items</span>
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
              <span key={p} className="chip">
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

      {inventory.length > 6 && (
        <div className="filters">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inventory" />
        </div>
      )}

      {inventory.length === 0 ? (
        <div className="empty">Nothing in inventory yet. Whatever you add here can fill snacks and desserts on the plan.</div>
      ) : (
        <div className="card list">
          {rows.map((i) => (
            <div key={i.id} className="item">
              <div>
                <div className="iname">{i.name}</div>
                <div className="muted small" title={i.createdAt ? i.createdAt.toLocaleString() : ""}>
                  added {ageLabel(i.createdAt)}
                </div>
              </div>
              <button
                className="iconbtn"
                type="button"
                aria-label={`Remove ${i.name}`}
                title="Used up, remove"
                onClick={() => deleteItem(hid, i.id).catch(onError)}
              >
                ✕
              </button>
            </div>
          ))}
          {rows.length === 0 && <div className="muted small pad">Nothing matches “{q}”.</div>}
        </div>
      )}
    </div>
  );
}
