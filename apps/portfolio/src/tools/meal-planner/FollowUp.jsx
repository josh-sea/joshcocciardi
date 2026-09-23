import React, { useEffect } from "react";
import { PEOPLE } from "./plan";

const THUMBS = [
  { value: "up", icon: "👍", label: "thumbs up" },
  { value: "neutral", icon: "😐", label: "neutral" },
  { value: "down", icon: "👎", label: "thumbs down" },
];

/* What appears after tapping Ate, kept to as few taps as possible, and every
   one of them skippable.

   A recipe asks for a thumb from whoever had it: one person for a breakfast
   or lunch slot (a single tap rates and closes), all four for dinner or
   dessert. An inventory item asks whether it's finished, with a one-tap
   "used up and back on the list". Nothing appears for a typed-in meal. */
export default function FollowUp({ followUp, ratings, onRate, onUsedUp, onClose }) {
  const { kind, name, people, when } = followUp;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const solo = people.length === 1;

  const rate = (personKey, value) => {
    onRate(personKey, value);
    if (solo) onClose();
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheetx" role="dialog" aria-label={name} onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <div>
            <div className="sheettitle">{kind === "recipe" ? `How was ${name}?` : `Finish the ${name}?`}</div>
            <div className="muted small">
              {kind === "recipe" ? `Marked made ${when}.` : "Keeps the inventory honest without a trip to that page."}
            </div>
          </div>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {kind === "recipe" ? (
          <>
            <div className="ratings follow">
              {PEOPLE.filter((p) => people.includes(p.key)).map((p) => (
                <div key={p.key} className="rate">
                  <span className="who">{p.name}</span>
                  <span className="thumbs big">
                    {THUMBS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        className={ratings[p.key] === t.value ? "on" : ""}
                        aria-pressed={ratings[p.key] === t.value}
                        aria-label={`${p.name}: ${t.label}`}
                        onClick={() => rate(p.key, t.value)}
                      >
                        {t.icon}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="sheetfoot">
              <button type="button" className={solo ? "chipbtn quiet" : "btn small"} onClick={onClose}>
                {solo ? "Skip" : "Done"}
              </button>
            </div>
          </>
        ) : (
          <div className="stack">
            <button type="button" className="btn" onClick={() => onUsedUp(true)}>
              Used it up, add to shopping list
            </button>
            <button type="button" className="btn ghost" onClick={() => onUsedUp(false)}>
              Used it up
            </button>
            <button type="button" className="chipbtn quiet" onClick={onClose}>
              Still have some
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
