import React, { useEffect, useState } from "react";
import { PEOPLE } from "./plan";

const THUMBS = [
  { value: "up", icon: "👍", label: "thumbs up" },
  { value: "neutral", icon: "😐", label: "neutral" },
  { value: "down", icon: "👎", label: "thumbs down" },
];

const USED = [
  { value: "list", label: "Used up + list" },
  { value: "used", label: "Used up" },
  { value: "some", label: "Some left" },
];

/* What appears after tapping Ate, as few taps as possible and all of it
   skippable. One block per thing that was eaten:

   - a recipe asks for a thumb from whoever had it (one person for a
     breakfast, lunch, or snack slot; all four for dinner or dessert)
   - an inventory item asks whether it's finished, with a one-tap "used up
     and back on the shopping list"

   The sheet closes on its own once every block has an answer, so the common
   case (one person, one recipe) is a single tap. */
export default function FollowUp({ title, sub, blocks, ratingsFor, onRate, onUsedUp, onClose }) {
  const [answered, setAnswered] = useState({});

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A recipe block is answered once everyone in it has a thumb; an inventory
  // block once one of its three buttons is tapped.
  const done = (next) =>
    blocks.every((b) =>
      b.kind === "recipe" ? b.people.every((p) => next[`${b.id}:${p}`]) : next[b.id]
    );

  const answer = (key, extra) => {
    const next = { ...answered, [key]: true, ...extra };
    setAnswered(next);
    if (done(next)) onClose();
  };

  const single = blocks.length === 1 ? blocks[0] : null;
  const heading = single
    ? single.kind === "recipe"
      ? `How was ${single.name}?`
      : `Finish the ${single.name}?`
    : title;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheetx" role="dialog" aria-label={heading} onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <div>
            <div className="sheettitle">{heading}</div>
            {sub && <div className="muted small">{sub}</div>}
          </div>
          <button className="chipbtn quiet" type="button" onClick={onClose}>
            {blocks.length > 1 || single?.people?.length > 1 ? "Done" : "Skip"}
          </button>
        </div>

        <div className="followlist">
          {blocks.map((b) => (
            <div key={`${b.kind}:${b.id}`} className="followblock">
              {!single && (
                <div className="followname">
                  <span className={`chip ${b.kind}`}>{b.name}</span>
                </div>
              )}
              {b.kind === "recipe" ? (
                <div className="ratings follow">
                  {PEOPLE.filter((p) => b.people.includes(p.key)).map((p) => {
                    const current = ratingsFor(b.id)[p.key];
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
                              aria-label={`${b.name}, ${p.name}: ${t.label}`}
                              onClick={() => {
                                onRate(b.id, p.key, t.value);
                                answer(`${b.id}:${p.key}`);
                              }}
                            >
                              {t.icon}
                            </button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="usedrow">
                  {USED.map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      className={`chipbtn ${answered[`${b.id}=${u.value}`] ? "on" : ""}`}
                      aria-label={`${b.name}: ${u.label}`}
                      onClick={() => {
                        if (u.value !== "some") onUsedUp(b.id, u.value === "list");
                        answer(b.id, { [`${b.id}=${u.value}`]: true });
                      }}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
