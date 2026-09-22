import React, { useCallback, useEffect, useState } from "react";
import PickSheet from "./PickSheet";
import { cleanPick, saveSlot, watchWeek } from "./store";
import {
  PEOPLE,
  addDays,
  dayProgress,
  isPick,
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

const PickText = ({ pick, placeholder }) =>
  isPick(pick) ? (
    <span className="picked">
      {pick.name}
      {pick.kind !== "text" && <span className={`tag ${pick.kind}`}>{pick.kind === "recipe" ? "recipe" : "inventory"}</span>}
    </span>
  ) : (
    <span className="placeholder">{placeholder}</span>
  );

/* The week, one day at a time. A strip of seven days across the top (with a
   settled-slots count under each), the chosen day's five sections below. */
export default function WeekPlan({ hid, recipes, inventory, onAddRecipe, onAddInventory, onError }) {
  const today = todayKey();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [dayKey, setDayKey] = useState(today);
  const [days, setDays] = useState({});
  const [sheet, setSheet] = useState(null);
  const [mod, setMod] = useState("");

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

  const snacks = [0, 1].map((i) => (isPick(day.snacks?.[i]) ? day.snacks[i] : null));
  const openSnack = (i) =>
    setSheet({
      title: `Snack ${i + 1}`,
      sub: `${dayName}, ${shortDate(dayKey)}`,
      value: snacks[i],
      sources: ["inventory"],
      onAddInventory,
      onPick: (p) => {
        const next = [...snacks];
        next[i] = cleanPick(p);
        save("snacks", next.some(Boolean) ? next : null);
      },
    });

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
            return (
              <button key={person.key} type="button" className={`slot ${state}`} onClick={() => openPerson(meal, person)}>
                <span className="who">{person.name}</span>
                {state === "none" ? (
                  <span className="none">Not needed</span>
                ) : (
                  <PickText pick={entry?.pick} placeholder="Undecided" />
                )}
              </button>
            );
          })}
        </section>
      ))}

      <section className="card">
        <h3 className="sechead">Snacks</h3>
        {snacks.map((s, i) => (
          <button key={i} type="button" className={`slot ${s ? "meal" : "undecided"}`} onClick={() => openSnack(i)}>
            <span className="who">Snack {i + 1}</span>
            <PickText pick={s} placeholder="From inventory" />
          </button>
        ))}
      </section>

      <section className="card">
        <h3 className="sechead">Dinner</h3>
        <button type="button" className={`slot ${isPick(day.dinner) ? "meal" : "undecided"}`} onClick={openDinner}>
          <span className="who">Everyone</span>
          <PickText pick={day.dinner} placeholder="Pick a recipe" />
        </button>
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
        <button type="button" className={`slot ${isPick(day.dessert) ? "meal" : "undecided"}`} onClick={openDessert}>
          <span className="who">Everyone</span>
          <PickText pick={day.dessert} placeholder="Recipe or inventory" />
        </button>
      </section>

      {sheet && (
        <PickSheet {...sheet} recipes={recipes} inventory={inventory} onClose={closeSheet} />
      )}
    </div>
  );
}
