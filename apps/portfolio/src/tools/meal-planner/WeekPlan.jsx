import React, { useCallback, useEffect, useMemo, useState } from "react";
import Chip, { Legend } from "./Chip";
import FollowUp from "./FollowUp";
import PickSheet from "./PickSheet";
import { saveMod, saveSlot, saveSnacks, setListed, setRating, setUsed, updateRecipe, watchWeek } from "./store";
import {
  addDays,
  dayProgress,
  followUpFor,
  isLegacyShared,
  laterKey,
  mondayOf,
  readDay,
  samePick,
  sectionSlots,
  shortDate,
  shownSections,
  slotPath,
  slotState,
  todayKey,
  weekDays,
  weekLabel,
  writeSlot,
} from "./plan";

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
function SlotRow({ label, slot, onOpen, onRemove, onSkip, onAte }) {
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
      ) : (
        <Pill kind="skip" label="Skip" on={state === "none"} onClick={onSkip} />
      )}
    </div>
  );
}

/* A shared section's mods note ("Cam: butter noodles instead of pesto").
   Edited locally and saved on blur, so typing isn't a write per keystroke;
   it resets whenever the saved text or the day changes underneath. */
function ModField({ label, saved, example, onSave }) {
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  return (
    <label className="field">
      <span className="flabel">{label} mods</span>
      <textarea
        className="input"
        rows={2}
        value={text}
        placeholder={example}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== saved && onSave(text.trim())}
      />
    </label>
  );
}

/* The week, one day at a time. A strip of seven days across the top (with a
   settled-slots count under each), the chosen day's sections below. */
export default function WeekPlan({ hid, config, recipes, inventory, stock, onAddRecipe, onAddInventory, onError }) {
  const today = todayKey();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [dayKey, setDayKey] = useState(today);
  const [days, setDays] = useState({});
  const [sheet, setSheet] = useState(null);
  const [followUp, setFollowUp] = useState(null);

  useEffect(() => {
    setDays({});
    return watchWeek(hid, monday, setDays, (e) => onError(e));
  }, [hid, monday, onError]);

  const week = weekDays(monday);
  const raw = days[dayKey];
  const day = useMemo(() => readDay(raw, config), [raw, config]);
  const sections = shownSections(config);
  const dayName = week.find((d) => d.key === dayKey)?.name || "";
  const when = `${dayName}, ${shortDate(dayKey)}`;

  // Lands on today when the week holds it, otherwise on that week's Monday.
  const shiftWeek = (n, home = false) => {
    const next = home ? mondayOf(today) : addDays(monday, 7 * n);
    setMonday(next);
    setDayKey(next === mondayOf(today) ? today : next);
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeFollowUp = useCallback(() => setFollowUp(null), []);

  // Every slot write goes through here, and usually writes just that one
  // field, so two phones editing different rows don't overwrite each other.
  // Two older shapes get replaced whole on their first edit instead:
  //   - a shared slot stored directly on the section (`dinner: { items }`),
  //     which moves under `dinner.all`
  //   - the old two-slot `snacks` array, which becomes the per-person map
  const write = (sec, person, slot) => {
    const value = writeSlot(slot);
    const key = person?.key;
    if (sec.key === "snack" && key && Array.isArray(raw?.snacks)) {
      const all = {};
      sec.people.forEach((p) => {
        all[p.key] = p.key === key ? value : writeSlot(day.snack.byPerson[p.key]);
      });
      return saveSnacks(hid, dayKey, all).catch(onError);
    }
    if (isLegacyShared(raw?.[sec.key])) {
      const whole = {};
      if (key) whole[key] = value;
      else if (value) whole.all = value;
      return saveSlot(hid, dayKey, sec.key, Object.keys(whole).length ? whole : null).catch(onError);
    }
    return saveSlot(hid, dayKey, slotPath(sec.key, key), value).catch(onError);
  };

  const slotOf = (sec, person) => (person ? day[sec.key].byPerson[person.key] : day[sec.key].shared);

  const open = (sec, person) => {
    const slot = slotOf(sec, person);
    const meal = sec.key === "snack" ? "Snack" : sec.label;
    setSheet({
      title: person ? `${person.name}: ${meal}` : sec.label,
      sub: when,
      items: slot.items,
      sources: sec.sources,
      allowText: sec.text,
      onAddRecipe: sec.sources.includes("recipe") ? onAddRecipe : null,
      onAddInventory: sec.sources.includes("inventory") ? onAddInventory : null,
      // Adding something to a skipped slot un-skips it; emptying it leaves it
      // undecided. Eaten carries over while the slot still has items.
      onChange: (items) =>
        write(sec, person, {
          items,
          none: false,
          eaten: slot.eaten && items.length > 0,
        }),
      onNone: () => write(sec, person, { items: [], none: true }),
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
  // pages in step: each recipe in the slot is marked made (dated to this plan
  // day, never earlier than it already was), and one follow-up asks for
  // thumbs on those recipes and shows a Used up / + List row for every
  // inventory item touched, picked directly or linked to a recipe. Turning
  // it off only clears the flag; undoing a rating or a used-up mark by
  // surprise would be worse.
  const ate = (sec, person) => {
    const slot = slotOf(sec, person);
    const eaten = !slot.eaten;
    write(sec, person, { ...slot, eaten });
    if (!eaten) return;
    const { recipes: ateRecipes, stock: touched } = followUpFor(slot.items, {
      recipes,
      inventory,
      people: person ? [person] : config.active,
    });
    ateRecipes.forEach((r) => {
      const current = recipes.find((x) => x.id === r.id);
      updateRecipe(hid, r.id, { made: true, lastMade: laterKey(current?.lastMade, dayKey) }).catch(onError);
    });
    if (!ateRecipes.length && !touched.length) return;
    const meal = sec.key === "snack" ? "snack" : sec.label.toLowerCase();
    setFollowUp({
      title: person ? `After ${person.name}'s ${meal}` : `After ${meal}`,
      sub: ateRecipes.length ? `Marked made ${when}.` : when,
      recipes: ateRecipes,
      stock: touched,
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
          const { done, total } = dayProgress(days[d.key], config);
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

      {sections.length === 0 && (
        <div className="empty">Every section is empty. Choose who eats what in Kitchen settings.</div>
      )}

      {sections.map((sec) => (
        <section key={sec.key} className="card">
          <h3 className="sechead">{sec.label}</h3>
          {sectionSlots(sec, day).map(({ person, slot }) => (
            <SlotRow
              key={person ? person.key : "all"}
              label={person ? person.name : "Everyone"}
              slot={slot}
              onOpen={() => open(sec, person)}
              onRemove={(pick) => removeItem(sec, person, pick)}
              onSkip={() => skip(sec, person)}
              onAte={() => ate(sec, person)}
            />
          ))}
          {sec.mode === "all" && (
            <ModField
              key={dayKey}
              label={sec.label}
              saved={day.mods[sec.key]}
              example={`${config.active[config.active.length - 1]?.name || "Sam"}: plain, no sauce`}
              onSave={(text) => saveMod(hid, dayKey, sec.key, text).catch(onError)}
            />
          )}
        </section>
      ))}

      {sheet && <PickSheet {...sheet} recipes={recipes} inventory={stock} onClose={closeSheet} />}

      {followUp && (
        <FollowUp
          {...followUp}
          inventory={inventory}
          ratingsFor={ratingsFor}
          onRate={(id, person, value) => setRating(hid, id, person, value).catch(onError)}
          onToggleUsed={(id, used) => setUsed(hid, id, used).catch(onError)}
          onToggleList={(id, listed) => setListed(hid, id, listed).catch(onError)}
          onClose={closeFollowUp}
        />
      )}
    </div>
  );
}
