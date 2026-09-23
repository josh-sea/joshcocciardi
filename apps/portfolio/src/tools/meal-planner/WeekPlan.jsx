import React, { useCallback, useEffect, useState } from "react";
import FollowUp from "./FollowUp";
import PickSheet from "./PickSheet";
import { cleanPick, saveSlot, setRating, setUsed, updateRecipe, watchWeek } from "./store";
import {
  PEOPLE,
  addDays,
  dayProgress,
  isPick,
  itemState,
  laterKey,
  mondayOf,
  shortDate,
  slotState,
  todayKey,
  weekDays,
  weekLabel,
} from "./plan";

const PER_PERSON = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
];

const EVERYONE = PEOPLE.map((p) => p.key);

// The buttons at the right end of a slot, so the common calls don't need the
// picker: Skip for a person who doesn't need the meal, Ate once it's eaten.
const Pill = ({ on, kind, label, onClick }) => (
  <button type="button" className={`pill ${kind} ${on ? "on" : ""}`} aria-pressed={!!on} onClick={onClick}>
    {kind === "ate" && on ? "✓ " : ""}
    {label}
  </button>
);

const PickText = ({ pick, placeholder }) =>
  isPick(pick) ? (
    <span className="picked">
      {pick.name}
      {pick.kind !== "text" && <span className={`tag ${pick.kind}`}>{pick.kind === "recipe" ? "recipe" : "inventory"}</span>}
    </span>
  ) : (
    <span className="placeholder">{placeholder}</span>
  );

// Dinner and dessert: one shared pick for everyone.
const SharedSlot = ({ pick, placeholder, onOpen, onAte }) => {
  const has = isPick(pick);
  return (
    <div className={`slot ${has ? "meal" : "undecided"} ${has && pick.eaten ? "eaten" : ""}`}>
      <button type="button" className="slotmain" onClick={onOpen}>
        <span className="who">Everyone</span>
        <PickText pick={pick} placeholder={placeholder} />
      </button>
      {has && <Pill kind="ate" label="Ate" on={pick.eaten} onClick={() => onAte(pick)} />}
    </div>
  );
};

/* The week, one day at a time. A strip of seven days across the top (with a
   settled-slots count under each), the chosen day's five sections below. */
export default function WeekPlan({ hid, recipes, inventory, stock, onAddRecipe, onAddInventory, onError }) {
  const today = todayKey();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [dayKey, setDayKey] = useState(today);
  const [days, setDays] = useState({});
  const [sheet, setSheet] = useState(null);
  const [mod, setMod] = useState("");
  const [followUp, setFollowUp] = useState(null);

  useEffect(() => {
    setDays({});
    return watchWeek(hid, monday, setDays, (e) => onError(e));
  }, [hid, monday, onError]);

  const week = weekDays(monday);
  const day = days[dayKey] || {};
  const dayName = week.find((d) => d.key === dayKey)?.name || "";

  // The dinner mod field is edited locally and saved on blur, so every
  // keystroke isn't a write. Reset it whenever the day (or its saved value)
  // changes underneath.
  const savedMod = day.dinnerMod || "";
  useEffect(() => setMod(savedMod), [savedMod, dayKey]);

  // Lands on today when the week holds it, otherwise on that week's Monday.
  const shiftWeek = (n, home = false) => {
    const next = home ? mondayOf(today) : addDays(monday, 7 * n);
    setMonday(next);
    setDayKey(next === mondayOf(today) ? today : next);
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeFollowUp = useCallback(() => setFollowUp(null), []);

  const save = (path, value) => saveSlot(hid, dayKey, path, value).catch(onError);

  const openPerson = (meal, person) => {
    const entry = day[meal.key]?.[person.key];
    setSheet({
      title: `${person.name}: ${meal.label}`,
      sub: `${dayName}, ${shortDate(dayKey)}`,
      value: isPick(entry?.pick) ? entry.pick : null,
      clearable: slotState(entry) !== "undecided",
      sources: ["recipe", "inventory"],
      allowText: true,
      onPick: (p) => save(`${meal.key}.${person.key}`, p ? { pick: cleanPick(p) } : null),
      onNone: () => save(`${meal.key}.${person.key}`, { none: true }),
    });
  };

  // Ate toggles the eaten flag on the pick itself. Turning it on also keeps
  // the other two pages in step: a recipe is marked made (dated to this plan
  // day, never earlier than it already was) and asks for thumbs from whoever
  // had it; an inventory item asks whether it's finished. Turning it off only
  // clears the flag, since undoing a rating or a used-up mark by surprise
  // would be worse than leaving it.
  const toggleAte = (pick, write, people) => {
    const eaten = !pick.eaten;
    write({ ...pick, eaten });
    if (!eaten) return;
    if (pick.kind === "recipe") {
      const r = recipes.find((x) => x.id === pick.id);
      if (!r) return;
      updateRecipe(hid, r.id, { made: true, lastMade: laterKey(r.lastMade, dayKey) }).catch(onError);
      setFollowUp({ kind: "recipe", id: r.id, name: r.name, people, when: `${dayName}, ${shortDate(dayKey)}` });
    } else if (pick.kind === "inventory") {
      const item = inventory.find((i) => i.id === pick.id);
      // Already struck through (Cam and Bodhi split the frozen pizza), or
      // deleted since: nothing to ask.
      if (!item || itemState(item) !== "stock") return;
      setFollowUp({ kind: "inventory", id: item.id, name: item.name, people });
    }
  };

  const writePerson = (meal, person) => (p) => save(`${meal.key}.${person.key}`, { pick: cleanPick(p) });
  const skipPerson = (meal, person, entry) =>
    save(`${meal.key}.${person.key}`, slotState(entry) === "none" ? null : { none: true });

  const snacks = [0, 1].map((i) => (isPick(day.snacks?.[i]) ? day.snacks[i] : null));
  const openSnack = (i) =>
    setSheet({
      title: `Snack ${i + 1}`,
      sub: `${dayName}, ${shortDate(dayKey)}`,
      value: snacks[i],
      sources: ["inventory"],
      onAddInventory,
      onPick: (p) => writeSnack(i)(p),
    });
  const writeSnack = (i) => (p) => {
    const next = [...snacks];
    next[i] = cleanPick(p);
    save("snacks", next.some(Boolean) ? next : null);
  };

  const openDinner = () =>
    setSheet({
      title: "Dinner",
      sub: `${dayName}, ${shortDate(dayKey)}`,
      value: isPick(day.dinner) ? day.dinner : null,
      sources: ["recipe"],
      onAddRecipe,
      onPick: (p) => save("dinner", cleanPick(p)),
    });

  const openDessert = () =>
    setSheet({
      title: "Dessert",
      sub: `${dayName}, ${shortDate(dayKey)}`,
      value: isPick(day.dessert) ? day.dessert : null,
      sources: ["recipe", "inventory"],
      onAddRecipe,
      onAddInventory,
      onPick: (p) => save("dessert", cleanPick(p)),
    });

  return (
    <div className="page">
      <div className="weeknav">
        <button className="iconbtn" type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          ‹
        </button>
        <div className="weeklabel">
          {weekLabel(monday)}
          {monday !== mondayOf(today) && (
            <button className="linkish" type="button" onClick={() => shiftWeek(0, true)}>
              this week
            </button>
          )}
        </div>
        <button className="iconbtn" type="button" onClick={() => shiftWeek(1)} aria-label="Next week">
          ›
        </button>
      </div>

      <div className="strip" role="tablist">
        {week.map((d) => {
          const { done, total } = dayProgress(days[d.key]);
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={d.key === dayKey}
              className={`daybtn ${d.key === dayKey ? "on" : ""} ${d.key === today ? "today" : ""}`}
              onClick={() => setDayKey(d.key)}
            >
              <span className="dname">{d.name.slice(0, 3)}</span>
              <span className="dnum">{shortDate(d.key).split(" ")[1]}</span>
              <span className={`dprog ${done === total ? "full" : ""}`}>
                {done}/{total}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="dayhead">
        {dayName} <span className="muted">{shortDate(dayKey)}</span>
      </h2>

      {PER_PERSON.map((meal) => (
        <section key={meal.key} className="card">
          <h3 className="sechead">{meal.label}</h3>
          {PEOPLE.map((person) => {
            const entry = day[meal.key]?.[person.key];
            const state = slotState(entry);
            const eaten = state === "meal" && entry.pick.eaten;
            return (
              <div key={person.key} className={`slot ${state} ${eaten ? "eaten" : ""}`}>
                <button type="button" className="slotmain" onClick={() => openPerson(meal, person)}>
                  <span className="who">{person.name}</span>
                  {state === "none" ? (
                    <span className="none">Not needed</span>
                  ) : (
                    <PickText pick={entry?.pick} placeholder="Undecided" />
                  )}
                </button>
                {state === "meal" ? (
                  <Pill
                    kind="ate"
                    label="Ate"
                    on={eaten}
                    onClick={() => toggleAte(entry.pick, writePerson(meal, person), [person.key])}
                  />
                ) : (
                  <Pill kind="skip" label="Skip" on={state === "none"} onClick={() => skipPerson(meal, person, entry)} />
                )}
              </div>
            );
          })}
        </section>
      ))}

      <section className="card">
        <h3 className="sechead">Snacks</h3>
        {snacks.map((s, i) => (
          <div key={i} className={`slot ${s ? "meal" : "undecided"} ${s?.eaten ? "eaten" : ""}`}>
            <button type="button" className="slotmain" onClick={() => openSnack(i)}>
              <span className="who">Snack {i + 1}</span>
              <PickText pick={s} placeholder="From inventory" />
            </button>
            {s && <Pill kind="ate" label="Ate" on={s.eaten} onClick={() => toggleAte(s, writeSnack(i), EVERYONE)} />}
          </div>
        ))}
      </section>

      <section className="card">
        <h3 className="sechead">Dinner</h3>
        <SharedSlot pick={day.dinner} placeholder="Pick a recipe" onOpen={openDinner} onAte={(p) => toggleAte(p, (x) => save("dinner", cleanPick(x)), EVERYONE)} />
        <label className="field">
          <span className="flabel">Dinner mods</span>
          <textarea
            className="input"
            rows={2}
            value={mod}
            placeholder="Cam: butter noodles instead of pesto"
            onChange={(e) => setMod(e.target.value)}
            onBlur={() => mod.trim() !== savedMod && save("dinnerMod", mod.trim())}
          />
        </label>
      </section>

      <section className="card">
        <h3 className="sechead">Dessert</h3>
        <SharedSlot pick={day.dessert} placeholder="Recipe or inventory" onOpen={openDessert} onAte={(p) => toggleAte(p, (x) => save("dessert", cleanPick(x)), EVERYONE)} />
      </section>

      {sheet && (
        <PickSheet {...sheet} recipes={recipes} inventory={stock} onClose={closeSheet} />
      )}

      {followUp && (
        <FollowUp
          followUp={followUp}
          ratings={recipes.find((r) => r.id === followUp.id)?.ratings || {}}
          onRate={(person, value) => setRating(hid, followUp.id, person, value).catch(onError)}
          onUsedUp={(toList) => {
            setUsed(hid, followUp.id, true, { toList }).catch(onError);
            closeFollowUp();
          }}
          onClose={closeFollowUp}
        />
      )}
    </div>
  );
}
