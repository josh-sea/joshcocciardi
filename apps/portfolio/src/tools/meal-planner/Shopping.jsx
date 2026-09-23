import React, { useMemo, useState } from "react";
import { checkout, deleteItem, listItems, setInCart, unlistItem } from "./store";
import { ageLabel, itemState, sortItems, splitItems } from "./plan";

/* The shopping list, in three parts:
     Add       type or dictate anything, it goes on the list
     To buy    check things off as they go in the cart; Done shopping moves
               the checked ones into inventory dated today
     Used up   everything struck through in inventory, one tap to list it
   All of it lives on the same inventory rows, so an item never exists twice:
   it's in stock, used up, or on the list, and buying it brings it back. */
export default function Shopping({ hid, user, inventory, onError }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const preview = useMemo(() => splitItems(text), [text]);
  const toBuy = useMemo(() => sortItems(inventory.filter((i) => i.onList)), [inventory]);
  const usedUp = useMemo(
    () => sortItems(inventory.filter((i) => !i.onList && itemState(i) === "used"), "name"),
    [inventory]
  );
  const inCart = toBuy.filter((i) => i.inCart);

  const run = async (fn) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    if (!preview.length || busy) return;
    run(async () => {
      await listItems(hid, user.uid, preview, inventory);
      setText("");
    });
  };

  const done = () =>
    run(async () => {
      const n = await checkout(
        hid,
        inCart.map((i) => i.id)
      );
      setNotice(`${n} item${n === 1 ? "" : "s"} added to inventory.`);
    });

  return (
    <div className="page">
      <div className="pagehead">
        <h2 className="h2">Shopping</h2>
        <span className="muted small">{toBuy.length} on the list</span>
      </div>

      <form className="card form" onSubmit={add}>
        <label className="field" style={{ marginTop: 0 }}>
          <span className="flabel">Add to the list</span>
          <textarea
            className="input"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="paper towels, bananas, coffee"
          />
        </label>
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
          {preview.length ? `Add ${preview.length} to the list` : "Add to the list"}
        </button>
      </form>

      <section className="card">
        <h3 className="sechead">To buy</h3>
        {toBuy.length === 0 && <div className="muted small pad">The list is empty.</div>}
        {toBuy.map((i) => (
          <div key={i.id} className={`trow ${i.inCart ? "carted" : ""}`}>
            <button
              className={`tick ${i.inCart ? "on" : ""}`}
              type="button"
              aria-pressed={i.inCart}
              aria-label={i.inCart ? `Take ${i.name} out of the cart` : `${i.name} is in the cart`}
              onClick={() => setInCart(hid, i.id, !i.inCart).catch(onError)}
            >
              {i.inCart ? "✓" : ""}
            </button>
            <span className="iname">
              {i.name}
              {itemState(i) === "wanted" && <span className="tag new">new</span>}
            </span>
            <button
              className="iconbtn quiet"
              type="button"
              aria-label={`Remove ${i.name} from the list`}
              onClick={() => unlistItem(hid, i).catch(onError)}
            >
              ✕
            </button>
          </div>
        ))}
        {toBuy.length > 0 && (
          <button className="btn" type="button" style={{ marginTop: 12 }} disabled={busy || !inCart.length} onClick={done}>
            {inCart.length ? `Done shopping: add ${inCart.length} to inventory` : "Check off what you bought"}
          </button>
        )}
        {notice && <div className="ok">{notice}</div>}
      </section>

      <section className="card">
        <h3 className="sechead">Used up</h3>
        {usedUp.length === 0 ? (
          <div className="muted small pad">Nothing used up. Strike things through in Inventory, or tap Ate on the plan.</div>
        ) : (
          <>
            <div className="muted small" style={{ marginBottom: 4 }}>
              Tap to put it back on the list.
            </div>
            {usedUp.map((i) => (
              <div key={i.id} className="trow">
                <button
                  className="relist"
                  type="button"
                  onClick={() => listItems(hid, user.uid, [i.name], inventory).catch(onError)}
                >
                  <span className="plus">+</span>
                  <span className="iname">{i.name}</span>
                  <span className="muted small">used {ageLabel(i.usedAt)}</span>
                </button>
                <button
                  className="iconbtn quiet"
                  type="button"
                  aria-label={`Forget ${i.name}`}
                  title="Won't rebuy: remove from inventory"
                  onClick={() => deleteItem(hid, i.id).catch(onError)}
                >
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
