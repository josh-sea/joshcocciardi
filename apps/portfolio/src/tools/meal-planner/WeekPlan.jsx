import React, { useCallback, useEffect, useMemo, useState } from "react";
import Chip, { Legend } from "./Chip";
import FollowUp from "./FollowUp";
import PickSheet from "./PickSheet";
import { saveSlot, saveSnacks, setRating, setUsed, updateRecipe, watchWeek } from "./store";
import {
  PEOPLE,
  SECTIONS,
  addDays,
  dayProgress,
  itemState,
  laterKey,
  mondayOf,
  readDay,
  samePick,
  shortDate,
  slotState,
  todayKey,
  weekDays,
  weekLabel,
  writeSlot,
} from "./plan";

const EVERYONE = PEOPLE.map((p) => p.key);

// The button at the right end of a slot: Skip for a person who doesn't need
// the meal, Ate once what's planned has been eaten.
const Pill = ({ on, kind, label, onClick }) => (
  <button type="button" className={`pill ${kind} ${on ? "on" : ""}`} aria-pressed={!!on} onClick={onClick}>
    {kind === "ate" && on ? "✓ " : ""}
    {label}
  </button>
);

/* One row of the plan. The chips are the slot's contents, each with its own
   ✕, so taking something off never needs the picker. The + (or tapping the
   empty part of the row) opens the picker to add more. */
function SlotRow({ label, slot, perPerson, onOpen, onRemove, onSkip, onAte }) {
  const state = slotState(slot);
  const openIfBackground = (e) => {
    if (e.target === e.currentTarget) onOpen();
  };
  return (
    <div className={`slot ${state} ${slot.eaten ? "eaten" : ""}`}>
      <button type="button" className="who" onClick={onOpen}>
        {label}
      </button>
      <div className="slotchips" onClick={openIfBackground}>
        {state === "none" && (
          <button type="button" className="none" onClick={onOpen}>
            Not needed
          </button>
        )}
        {state === "undecided" && (
          <button type="button" className="placeholder" onClick={onOpen}>
            Undecided
          </button>
        )}
        {slot.items.map((p) => (
          <Chip key={`${p.kind}:${p.id || p.name}`} pick={p} onRemove={() => onRemove(p)} />
        ))}
        {state === "meal" && (
          <button type="button" className="addchip" aria-label={`Add to ${label}`} onClick={onOpen}>
            +
          </button>
        )}
      </div>
      {state === "meal" ? (
        <Pill kind="ate" label="Ate" on={slot.eaten} onClick={onAte} />
      ) : perPerson ? (
        <Pill kind="skip" label="Skip" on={state === "none"} onClick={onSkip} />
      ) : null}
    </div>
  );
}

/* The week, one day at a time. A strip of seven days across the top (with a
   settled-slots count under each), the chosen day's sections below. */
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
  const day = useMemo(() => readDay(days[dayKey]), [days, dayKey]);
  const dayName = week.find((d) => d.key === dayKey)?.name || "";
  const when = `${dayName}, ${shortDate(dayKey)}`;

  // The dinner mod field is edited locally and saved on blur, so every
  // keystroke isn't a write. Reset it whenever the day (or its saved value)
  // changes underneath.
  const savedMod = day.dinnerMod;
  useEffect(() => setMod(savedMod), [savedMod, dayKey]);

  // Lands on today when the week holds it, otherwise on that week's Monday.
  const shiftWeek = (n, home = false) => {
    const next = home ? mondayOf(today) : addDays(monday, 7 * n);
    setMonday(next);
    setDayKey(next === mondayOf(today) ? today : next);
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeFollowUp = useCallback(() => setFollowUp(null), []);

  // Every slot write goes through here, and writes just that one field. The
  // exception is the first snack edit on a day still holding the old
  // two-slot `snacks` array: that one saves the whole per-person map and
  // retires the array in the same write.
  const write = (sec, person, slot) => {
    const value = writeSlot(slot);
    if (sec.key === "snack" && Array.isArray(days[dayKey]?.snacks)) {
      const all = {};
      PEOPLE.forEach((p) => {
        all[p.key] = p.key === person ? value : writeSlot(day.snack[p.key]);
      });
      return saveSnacks(hid, dayKey, all).catch(onError);
    }
    const path = sec.perPerson ? `${sec.key}.${person}` : sec.key;
    return saveSlot(hid, dayKey, path, value).catch(onError);
  };

  const slotOf = (sec, person) => (sec.perPerson ? day[sec.key][person] : day[sec.key]);

  const open = (sec, person) => {
    const who = PEOPLE.find((p) => p.key === person);
    const slot = slotOf(sec, person);
    setSheet({
      title: who ? `${who.name}: ${sec.key === "snack" ? "Snack" : sec.label}` : sec.label,
      sub: when,
      items: slot.items,
      sources: sec.sources,
      allowText: sec.text,
      onAddRecipe: sec.sources.includes("recipe") ? onAddRecipe : null,
      onAddInventory: sec.sources.includes("inventory") ? onAddInventory : null,
      // Adding something to a skipped slot un-skips it; emptying it leaves it
      // undecided. Eaten carries over while the slot still has items.
      onChange: (items) => write(sec, person, { items, none: false, eaten: slot.eaten && items.length > 0 }),
      onNone: sec.perPerson ? () => write(sec, person, { items: [], none: true }) : null,
    });
  };

  const removeItem = (sec, person, pick) => {
    const slot = slotOf(sec, person);
    const items = slot.items.filter((x) => !samePick(x, pick));
    write(sec, person, { items, eaten: slot.eaten && items.length > 0 });
  };

  const skip = (sec, person) => {
    const slot = slotOf(sec, person);
    write(sec, person, { items: [], none: slotState(slot) !== "none" });
  };

  // Ate flags the whole slot as eaten. Turning it on also keeps the other
  // pages in step, one block per item in a single follow-up: each recipe is
  // marked made (dated to this plan day, never earlier than it already was)
  // and asks for thumbs from whoever had it, and each inventory item still in
  // stock asks whether it's finished. Turning it off only clears the flag;
  // undoing a rating or a used-up mark by surprise would be worse.
  const ate = (sec, person) => {
    const slot = slotOf(sec, person);
    const eaten = !slot.eaten;
    write(sec, person, { ...slot, eaten });
    if (!eaten) return;
    const people = person ? [person] : EVERYONE;
    const blocks = [];
    slot.items.forEach((p) => {
      if (blocks.some((b) => b.kind === p.kind && b.id === p.id)) return;
      if (p.kind === "recipe") {
        const r = recipes.find((x) => x.id === p.id);
        if (!r) return;
        updateRecipe(hid, r.id, { made: true, lastMade: laterKey(r.lastMade, dayKey) }).catch(onError);
        blocks.push({ kind: "recipe", id: r.id, name: r.name, people });
      } else if (p.kind === "inventory") {
        const item = inventory.find((i) => i.id === p.id);
        // Already struck through (Cam and Bodhi split the frozen pizza), or
        // deleted since: nothing to ask.
        if (item && itemState(item) === "stock") blocks.push({ kind: "inventory", id: item.id, name: item.name });
      }
    });
    if (!blocks.length) return;
    const who = PEOPLE.find((p) => p.key === person);
    const meal = sec.key === "snack" ? "snack" : sec.label.toLowerCase();
    setFollowUp({
      title: who ? `After ${who.name}'s ${meal}` : `After ${meal}`,
      sub: blocks.some((b) => b.kind === "recipe") ? `Marked made ${when}.` : when,
      blocks,
    });
  };

  const ratingsFor = (id) => recipes.find((r) => r.id === id)?.ratings || {};

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

      <div className="dayline">
        <h2 className="dayhead">
          {dayName} <span className="muted">{shortDate(dayKey)}</span>
        </h2>
        <Legend />
      </div>

      {SECTIONS.map((sec) => (
        <section key={sec.key} className="card">
          <h3 className="sechead">{sec.label}</h3>
          {sec.perPerson ? (
            PEOPLE.map((p) => (
              <SlotRow
                key={p.key}
                label={p.name}
                slot={day[sec.key][p.key]}
                perPerson
                onOpen={() => open(sec, p.key)}
                onRemove={(pick) => removeItem(sec, p.key, pick)}
                onSkip={() => skip(sec, p.key)}
                onAte={() => ate(sec, p.key)}
              />
            ))
          ) : (
            <SlotRow
              label="Everyone"
              slot={day[sec.key]}
              onOpen={() => open(sec, null)}
              onRemove={(pick) => removeItem(sec, null, pick)}
              onAte={() => ate(sec, null)}
            />
          )}
          {sec.key === "dinner" && (
            <label className="field">
              <span className="flabel">Dinner mods</span>
              <textarea
                className="input"
                rows={2}
                value={mod}
                placeholder="Cam: butter noodles instead of pesto"
                onChange={(e) => setMod(e.target.value)}
                onBlur={() => mod.trim() !== savedMod && saveSlot(hid, dayKey, "dinnerMod", mod.trim()).catch(onError)}
              />
            </label>
          )}
        </section>
      ))}

      {sheet && <PickSheet {...sheet} recipes={recipes} inventory={stock} onClose={closeSheet} />}

      {followUp && (
        <FollowUp
          {...followUp}
          ratingsFor={ratingsFor}
          onRate={(id, person, value) => setRating(hid, id, person, value).catch(onError)}
          onUsedUp={(id, toList) => setUsed(hid, id, true, { toList }).catch(onError)}
          onClose={closeFollowUp}
        />
      )}
    </div>
  );
}
