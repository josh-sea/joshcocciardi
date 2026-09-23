import React, { useEffect, useState } from "react";
import { itemState } from "./plan";

const THUMBS = [
  { value: "up", icon: "👍", label: "thumbs up" },
  { value: "neutral", icon: "😐", label: "neutral" },
  { value: "down", icon: "👎", label: "thumbs down" },
];

/* What appears after tapping Ate, as few taps as possible and all of it
   skippable.

   - Each recipe eaten asks for a thumb from whoever had it (that person for
     a person's row, everyone for a shared one).
   - Each inventory item touched, whether picked directly or linked to one of
     those recipes, gets one row with two independent toggles: Used up and
     + List. Tap either, both, or neither; neither means there's some left,
     so the common case needs no tap at all. The toggles show the item's live
     state and each tap saves, so tapping again undoes it.

   When it's only ratings, the sheet closes itself once everyone has one, so
   one person and one recipe is a single tap. With inventory rows there's no
   way to tell "some left" from "not answered yet", so it waits for Done. */
export default function FollowUp({
  title,
  sub,
  recipes,
  stock,
  inventory,
  ratingsFor,
  onRate,
  onToggleUsed,
  onToggleList,
  onClose,
}) {
  const [rated, setRated] = useState({});

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rate = (r, p, value) => {
    onRate(r.id, p.key, value);
    const next = { ...rated, [`${r.id}:${p.key}`]: true };
    setRated(next);
    const allRated = recipes.every((x) => x.people.every((q) => next[`${x.id}:${q.key}`]));
    if (!stock.length && allRated) onClose();
  };

  const onlyRecipe = recipes.length === 1 && !stock.length ? recipes[0] : null;
  const onlyItem = stock.length === 1 && !recipes.length ? stock[0] : null;
  const heading = onlyRecipe ? `How was ${onlyRecipe.name}?` : onlyItem ? `Finish the ${onlyItem.name}?` : title;
  const solo = onlyRecipe && onlyRecipe.people.length === 1;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheetx" role="dialog" aria-label={heading} onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <div>
            <div className="sheettitle">{heading}</div>
            {sub && <div className="muted small">{sub}</div>}
          </div>
          <button className={solo ? "chipbtn quiet" : "btn small"} type="button" onClick={onClose}>
            {solo ? "Skip" : "Done"}
          </button>
        </div>

        <div className="followlist">
          {recipes.map((r) => (
            <div key={r.id} className="followblock">
              {!onlyRecipe && (
                <div className="followname">
                  <span className="chip recipe">{r.name}</span>
                </div>
              )}
              <div className="ratings follow">
                {r.people.map((p) => {
                  const current = ratingsFor(r.id)[p.key];
                  return (
                    <div key={p.key} className="rate">
                      <span className="who">{p.name}</span>
                      <span className="thumbs big">
                        {THUMBS.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            className={current === t.value ? "on" : ""}
                            aria-pressed={current === t.value}
                            aria-label={`${r.name}, ${p.name}: ${t.label}`}
                            onClick={() => rate(r, p, t.value)}
                          >
                            {t.icon}
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {stock.length > 0 && (
            <div className="followblock">
              <div className="flabel" style={{ marginBottom: 0 }}>
                Inventory
              </div>
              <div className="muted small">Leave both off if there's some left.</div>
              {stock.map((s) => {
                const item = inventory.find((i) => i.id === s.id);
                const used = item ? itemState(item) === "used" : false;
                const listed = !!item?.onList;
                return (
                  <div key={s.id} className="stockrow">
                    <span className="chip inventory">{s.name}</span>
                    <span className="stockbtns" role="group" aria-label={s.name}>
                      <button
                        type="button"
                        className={`toggle ${used ? "on" : ""}`}
                        aria-pressed={used}
                        aria-label={`${s.name}: used up`}
                        disabled={!item}
                        onClick={() => onToggleUsed(s.id, !used)}
                      >
                        {used ? "✓ " : ""}Used up
                      </button>
                      <button
                        type="button"
                        className={`toggle ${listed ? "on" : ""}`}
                        aria-pressed={listed}
                        aria-label={`${s.name}: on the shopping list`}
                        disabled={!item}
                        onClick={() => onToggleList(s.id, !listed)}
                      >
                        {listed ? "✓ List" : "+ List"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
