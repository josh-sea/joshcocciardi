/* What else is happening at a given hour, and why a queue might look odd.
 *
 * The wait curve says what a ride usually does. It does not say why. A
 * parade at two locks a few thousand people along a route; fireworks pull
 * the park toward the hub; a ticketed party shuts the gates to day guests
 * at six and everybody crams the headliners from four. Those are the
 * explanations you want when a bar looks wrong, and the API has all of
 * them: shows carry their times, and the schedule carries the park's hours
 * and its ticketed events.
 *
 * Pure. No DOM, no network.
 */

/* ── what kind of thing is this ──────────────────────────────────────────── */

/* Matched on names, which is a heuristic and is treated as one: getting it
 * wrong mislabels an icon, it does not invent an event. Order matters,
 * since "Boo-To-You Halloween Parade" is a parade before it is anything else.
 */
const KINDS = [
  ['parade',    /\b(parade|cavalcade|processional)\b/i],
  ['fireworks', /\b(fireworks|spectacular|nighttime|happily ever after|luminous|fantasmic|rapsodia|enchantment|wishes)\b/i],
  ['meet',      /^meet\b|\bmeet\s.+\bat\b|character (greeting|meet)/i],
  ['music',     /\b(dans|band|philharmonic|pianist|quartet|drummers|singers|choir)\b/i],
  ['show',      /./],
];

export function kindOf(name) {
  const n = String(name || '');
  for (const [kind, re] of KINDS) if (re.test(n)) return kind;
  return 'show';
}

// What is worth interrupting a chart for. A barbershop quartet moves nobody.
export const MOVES_CROWDS = new Set(['parade', 'fireworks']);

/* ── the park's own day ──────────────────────────────────────────────────── */

const ms = (t) => new Date(t).getTime();
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/* Pull today's rows out of the schedule: the operating window, early entry,
 * and any ticketed event.
 */
export function dayShape(schedule, dateStr) {
  const rows = (schedule || []).filter((s) => s.date === dateStr);
  const operating = rows.find((s) => s.type === 'OPERATING') || null;
  const early = rows.find((s) => s.description === 'Early Entry') || null;
  const ticketed = rows.filter(
    (s) => s.type === 'TICKETED_EVENT' && s.description !== 'Early Entry'
  );
  return {
    open: operating ? ms(operating.openingTime) : null,
    close: operating ? ms(operating.closingTime) : null,
    earlyOpen: early ? ms(early.openingTime) : null,
    ticketed: ticketed.map((t) => ({ start: ms(t.openingTime), end: ms(t.closingTime), name: t.description || 'Ticketed event' })),
  };
}

/* Is this moment inside a ticketed event rather than the ordinary day?
 *
 * Data rather than names: a show at ten at night on a day the park shuts at
 * six is party-only, whatever it happens to be called. Guessing from the
 * title would miss the ones that do not say so.
 */
export function duringTicketed(t, shape) {
  if (!shape) return null;
  return shape.ticketed.find((e) => t >= e.start && t < e.end) || null;
}

export const PARTY_RUN_UP_MIN = 120;

/* What the park itself is doing at this hour, in a sentence.
 *
 * The run-up matters more than the party: a park that shuts at six to day
 * guests has everybody piling onto the headliners from four, and that is
 * the part a wait curve shows and never explains.
 */
export function parkNote(t, shape) {
  if (!shape || shape.open === null) return null;

  const party = duringTicketed(t, shape);
  if (party) return { tone: 'party', says: `${party.name}. Day tickets are not valid now.` };

  if (shape.earlyOpen !== null && t >= shape.earlyOpen && t < shape.open) {
    return { tone: 'early', says: 'Early Entry. Resort guests only, and they head straight for the headliners.' };
  }
  if (t < shape.open) return { tone: 'shut', says: 'Before opening.' };
  if (t >= shape.close) return { tone: 'shut', says: 'After closing.' };

  const toClose = (shape.close - t) / 60000;
  const closingForParty = shape.ticketed.some((e) => e.start >= shape.close && e.start - shape.close <= 4 * 3600e3);
  if (closingForParty && toClose <= PARTY_RUN_UP_MIN) {
    return { tone: 'rush', says: 'Last couple of hours before the park closes early for a ticketed party. Expect a rush.' };
  }
  if (toClose <= 60) return { tone: 'rush', says: 'Last hour before close.' };
  return null;
}

/* ── what is on ──────────────────────────────────────────────────────────── */

/* Every showtime that starts inside the window, plus anything long enough to
 * be running through it.
 *
 * `shows` is the live feed's SHOW entities. Meet-and-greets and atmosphere
 * acts are carried but marked, so the caller can keep them out of the way
 * without this function deciding for it.
 */
export function showsAt(shows, from, to) {
  const out = [];
  for (const s of shows || []) {
    const kind = kindOf(s.name);
    for (const slot of s.showtimes || []) {
      const start = ms(slot.startTime);
      if (!Number.isFinite(start)) continue;
      const end = Number.isFinite(ms(slot.endTime)) ? ms(slot.endTime) : start + 30 * 60000;

      // A thing that runs all day is a location, not an event: "Meet Ariel,
      // 9:30 to 17:30" tells you nothing about two o'clock.
      const allDay = end - start > 4 * 3600e3;
      const starts = start >= from && start < to;
      if (!starts && !(overlaps(from, to, start, end) && !allDay)) continue;

      out.push({
        id: s.id,
        name: s.name,
        kind,
        start,
        end,
        startsHere: starts,
        moves: MOVES_CROWDS.has(kind),
      });
    }
  }
  return out.sort((a, b) => (b.moves - a.moves) || (a.start - b.start));
}

/* Everything worth saying about one hour, ready to render. */
export function whatsOn(hourStart, { shows, schedule, dateStr, hourMs = 3600e3 }) {
  const to = hourStart + hourMs;
  const shape = dayShape(schedule, dateStr);
  const all = showsAt(shows, hourStart, to);
  return {
    note: parkNote(hourStart, shape),
    big: all.filter((e) => e.moves),
    other: all.filter((e) => !e.moves && e.kind !== 'meet' && e.kind !== 'music'),
    quiet: all.filter((e) => e.kind === 'meet' || e.kind === 'music'),
    shape,
  };
}
