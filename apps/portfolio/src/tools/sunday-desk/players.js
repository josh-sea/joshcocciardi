// ---------------------------------------------------------------------------
// Pure reads over ESPN's player shapes.
//
// Split out from espn.js on purpose: that module opens a callable against the
// Firebase app, so importing it drags a browser environment along. Everything
// here is a plain function over JSON, which is what makes the strategy reports
// testable outside a browser.
// ---------------------------------------------------------------------------

export const POSITIONS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };

export const SLOTS = {
  0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE",
  7: "OP", 16: "D/ST", 17: "K", 18: "P", 19: "HC", 20: "BE", 21: "IR", 23: "FLEX",
};

export const PRO_TEAMS = {
  0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA",
  16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI",
  23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR",
  30: "JAX", 33: "BAL", 34: "HOU",
};

export const posName = (id) => POSITIONS[id] || `POS ${id}`;
export const slotName = (id) => SLOTS[id] || `slot ${id}`;
export const teamAbbrev = (id) => PRO_TEAMS[id] || `T${id}`;

export const isBench = (slotId) => slotId === 20 || slotId === 21;

// ESPN spells injuries in caps with underscores.
export const injuryLabel = (status) => {
  if (!status || status === "ACTIVE" || status === "NORMAL") return null;
  return String(status).replace(/_/g, " ").toLowerCase();
};

/* A player's stat array holds one entry per (week, source) pair. statSourceId
   0 is what actually happened, 1 is ESPN's projection. Both matter: the
   difference between them is the whole "should I start him" question. */
export const weekPoints = (player, week) => {
  const stats = player?.stats || [];
  const pick = (source) =>
    stats.find((s) => s.scoringPeriodId === week && s.statSourceId === source);
  const actual = pick(0);
  const projected = pick(1);
  return {
    actual: typeof actual?.appliedTotal === "number" ? actual.appliedTotal : null,
    projected: typeof projected?.appliedTotal === "number" ? projected.appliedTotal : null,
  };
};

export const fullName = (player) =>
  player?.fullName || [player?.firstName, player?.lastName].filter(Boolean).join(" ") || "Unknown";
