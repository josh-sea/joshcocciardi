// ---------------------------------------------------------------------------
// Strategy: the things worth knowing before Sunday, computed from data the
// tool already has rather than fetched on a schedule.
//
// Everything here is a pure function over a league snapshot. Nothing reaches
// the network, so each report is cheap to recompute and easy to reason about.
// ---------------------------------------------------------------------------

import { isBench, posName, weekPoints } from "./players.js";

// ESPN numbers its lineup slots; these are the ones a standard league starts.
const SLOT_TO_POS = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "DST", 17: "K" };
const FLEX_SLOT = 23;
const FLEX_POSITIONS = ["RB", "WR", "TE"];
// Checked in this order so a shortfall list reads the way a lineup fills.
const POS_ORDER = ["QB", "RB", "WR", "TE", "DST", "K"];

const hurtStatuses = new Set(["OUT", "INJURY_RESERVE", "DOUBTFUL", "SUSPENSION", "PUP"]);
const watchStatuses = new Set(["QUESTIONABLE", "DAY_TO_DAY"]);

export const injurySeverity = (status) => {
  if (!status) return null;
  const s = String(status).toUpperCase();
  if (hurtStatuses.has(s)) return "out";
  if (watchStatuses.has(s)) return "watch";
  return null;
};

/* How many starters the league requires at each position, read from the
   league's own settings. Falls back to counting who is actually started this
   week, which is right often enough to be useful and never throws. */
export const requiredStarters = (league, roster) => {
  const counts = league?.settings?.rosterSettings?.lineupSlotCounts;
  const out = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0, FLEX: 0 };
  if (counts && typeof counts === "object") {
    Object.entries(counts).forEach(([slotId, n]) => {
      const id = Number(slotId);
      if (SLOT_TO_POS[id]) out[SLOT_TO_POS[id]] += n;
      else if (id === FLEX_SLOT) out.FLEX += n;
    });
    if (Object.values(out).some((n) => n > 0)) return out;
  }
  (roster || []).forEach((e) => {
    if (isBench(e.slotId)) return;
    if (SLOT_TO_POS[e.slotId]) out[SLOT_TO_POS[e.slotId]] += 1;
    else if (e.slotId === FLEX_SLOT) out.FLEX += 1;
  });
  return out;
};

/* Week by week, who is off and whether that leaves a hole you cannot fill.
   The flex is checked last, against whatever RB/WR/TE are left over once the
   dedicated slots are covered — the same order a lineup actually fills. */
export const byeReport = ({ roster, byeByProTeam, required, fromWeek = 1, toWeek = 18 }) => {
  const weeks = [];
  for (let week = fromWeek; week <= toWeek; week += 1) {
    const off = (roster || []).filter((e) => e.player && byeByProTeam[e.player.proTeamId] === week);
    if (off.length === 0) continue;

    const availableAt = (pos) =>
      (roster || []).filter(
        (e) =>
          e.player &&
          posName(e.player.defaultPositionId) === pos &&
          byeByProTeam[e.player.proTeamId] !== week
      ).length;

    const shortfalls = [];
    let flexPool = 0;
    POS_ORDER.forEach((pos) => {
      const need = required[pos] || 0;
      const have = availableAt(pos);
      if (need > 0 && have < need) shortfalls.push({ pos, need, have });
      if (FLEX_POSITIONS.includes(pos)) flexPool += Math.max(0, have - need);
    });
    if ((required.FLEX || 0) > flexPool) {
      shortfalls.push({ pos: "FLEX", need: required.FLEX, have: flexPool });
    }

    weeks.push({
      week,
      off,
      starters: off.filter((e) => !e.bench).length,
      shortfalls,
      severity: shortfalls.length ? "bad" : off.filter((e) => !e.bench).length >= 3 ? "warn" : "ok",
    });
  }
  return weeks;
};

/* Who on the roster is hurt, and who is available on the same NFL team at the
   same position. ESPN's fantasy API carries no depth chart, so this is an
   inference from team plus position plus projection — a shortlist to check,
   not an answer. */
export const injuryReport = ({ roster, available, week }) =>
  (roster || [])
    .map((entry) => {
      const p = entry.player;
      if (!p) return null;
      const severity = injurySeverity(p.injuryStatus);
      if (!severity) return null;
      const candidates = (available || [])
        .map((row) => row.player || row)
        .filter(
          (c) =>
            c &&
            c.proTeamId === p.proTeamId &&
            c.defaultPositionId === p.defaultPositionId &&
            c.id !== p.id
        )
        .sort(
          (a, b) =>
            (weekPoints(b, week).projected || 0) - (weekPoints(a, week).projected || 0) ||
            (b.ownership?.percentOwned || 0) - (a.ownership?.percentOwned || 0)
        )
        .slice(0, 4);
      return { entry, player: p, severity, candidates };
    })
    .filter(Boolean)
    .sort((a, b) => (a.severity === "out" ? -1 : 1) - (b.severity === "out" ? -1 : 1));

/* Recent adds and drops. ESPN's transaction payload has moved around more than
   the other views, so this reads several shapes and reports honestly when it
   recognises none of them rather than rendering an empty list as "no activity".
 */
export const parseTransactions = (payload, { rosteredIds = new Set() } = {}) => {
  const rows = payload?.transactions || payload?.topics || [];
  if (!Array.isArray(rows)) {
    return { items: [], unparsed: 0, shape: typeof rows };
  }
  const items = [];
  let unparsed = 0;
  rows.forEach((t) => {
    const items0 = t?.items || t?.entries;
    if (!Array.isArray(items0)) {
      unparsed += 1;
      return;
    }
    items0.forEach((it) => {
      const type = it?.type || t?.type;
      const playerId = it?.playerId ?? it?.playerPoolEntry?.id;
      if (!type || playerId === undefined) {
        unparsed += 1;
        return;
      }
      items.push({
        type: String(type).toUpperCase(),
        playerId,
        fromTeamId: it.fromTeamId,
        toTeamId: it.toTeamId,
        date: t?.proposedDate || t?.date || null,
        stillAvailable: !rosteredIds.has(playerId),
      });
    });
  });
  return { items, unparsed, shape: null };
};

/* Drops nobody has picked back up. The interesting half of the transaction
   log: someone gave up on a player and he is still sitting there. */
export const dropsWorthLooking = ({ parsed, playersById, available }) => {
  const availableIds = new Set((available || []).map((r) => (r.player || r).id));
  return (parsed?.items || [])
    .filter((i) => i.type === "DROP" && availableIds.has(i.playerId))
    .map((i) => ({ ...i, player: playersById[i.playerId] || null }))
    .filter((i) => i.player);
};
