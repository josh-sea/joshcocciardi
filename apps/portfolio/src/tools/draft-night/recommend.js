// ---------------------------------------------------------------------------
// Generic recommendation engine.
//
// The hand-written tree in data.js only applies to the one league it was
// written for. For every other league shape this takes over: best available
// player, filtered to the positions you are still short at, with the
// must-fill slots (QB, TE, D/ST, K) forced once there are only enough picks
// left to cover them.
// ---------------------------------------------------------------------------

import { PLAYERS } from "./data";
import { positionTargets, roundCount } from "./league";

// Positions nobody should spend a mid-round pick on.
const LATE = ["K", "DST"];
// Positions where the starting slot has to be filled by someone.
const MUST_FILL = ["QB", "TE", "DST", "K"];

export const bestAvailable = ({ cfg, goneSet, counts, roundIdx, limit = 5 }) => {
  const targets = positionTargets(cfg);
  const picksLeft = roundCount(cfg) - roundIdx;
  const alive = PLAYERS.filter((p) => !goneSet.has(p.name));
  const short = (pos) => (targets[pos] || 0) - (counts[pos] || 0) > 0;

  // How many picks are already spoken for by empty mandatory starting slots.
  const mandatory = MUST_FILL.filter((pos) => (cfg.slots[pos] || 0) - (counts[pos] || 0) > 0);
  const mandatoryLeft = mandatory.reduce(
    (n, pos) => n + Math.max(0, (cfg.slots[pos] || 0) - (counts[pos] || 0)),
    0
  );

  let pool;
  let reason;
  if (picksLeft <= mandatoryLeft) {
    // Out of slack: every remaining pick has to fill a starting slot.
    pool = alive.filter((p) => mandatory.includes(p.pos));
    reason = `${mandatory.map((p) => (p === "DST" ? "D/ST" : p)).join(" and ")} still empty`;
  } else {
    pool = alive.filter((p) => short(p.pos) && !LATE.includes(p.pos));
    reason = "best available at a position you still need";
  }
  if (!pool.length) pool = alive.filter((p) => short(p.pos));
  if (!pool.length) pool = alive;

  // PLAYERS is already in rank order, so the head of the pool is the board's
  // best surviving player that fits.
  return { picks: pool.slice(0, limit), reason };
};
