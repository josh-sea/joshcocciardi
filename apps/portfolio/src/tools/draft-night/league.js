// ---------------------------------------------------------------------------
// League configuration.
//
// Everything that used to be hardcoded for one seat in one league now comes
// from a config object: team count, draft slot, roster shape, scoring. Pick
// numbers, round count, and positional targets are derived from it, so the
// same tool works for anyone's draft.
//
// The hand-written pick tree in data.js is still written for exactly one
// league (10 teams, seat 2, half PPR, 14 rounds). `treeFits` says whether it
// applies; when it doesn't, the tool falls back to best-available-by-need
// rather than handing someone advice built for a draft they aren't in.
// ---------------------------------------------------------------------------

export const POSITIONS = ["QB", "RB", "WR", "TE", "FLEX", "DST", "K"];

// Positions a FLEX can hold. Superflex adds QB.
export const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

export const PRESETS = {
  josh: {
    label: "John Jay FC (yours)",
    blurb: "10 team, snake, half PPR, 9 starters and 5 bench. The league the pick tree was written for.",
    config: {
      teams: 10,
      seat: 2,
      slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 5 },
      scoring: { ppr: 0.5, passTd: 4, superflex: false },
    },
  },
  espn: {
    label: "ESPN default",
    blurb: "10 team, snake, full PPR, 9 starters and 7 bench. What you get if nobody touches the settings.",
    config: {
      teams: 10,
      seat: 1,
      slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 7 },
      scoring: { ppr: 1, passTd: 4, superflex: false },
    },
  },
  custom: {
    label: "Custom",
    blurb: "Set the team count, your draft slot, every roster spot, and the scoring yourself.",
    config: {
      teams: 12,
      seat: 1,
      slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 6 },
      scoring: { ppr: 0.5, passTd: 4, superflex: false },
    },
  },
};

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

// Anything read back from Firestore or localStorage goes through here, so a
// hand-edited or half-written document can't put the tool into a state where
// the clock points at a pick that doesn't exist.
export const normalizeConfig = (raw) => {
  const base = PRESETS.josh.config;
  const slotsIn = raw?.slots || {};
  const slots = {
    QB: clampInt(slotsIn.QB, 0, 3, base.slots.QB),
    RB: clampInt(slotsIn.RB, 0, 6, base.slots.RB),
    WR: clampInt(slotsIn.WR, 0, 6, base.slots.WR),
    TE: clampInt(slotsIn.TE, 0, 3, base.slots.TE),
    FLEX: clampInt(slotsIn.FLEX, 0, 4, base.slots.FLEX),
    DST: clampInt(slotsIn.DST, 0, 2, base.slots.DST),
    K: clampInt(slotsIn.K, 0, 2, base.slots.K),
    BN: clampInt(slotsIn.BN, 0, 12, base.slots.BN),
  };
  const teams = clampInt(raw?.teams, 4, 16, base.teams);
  const pprRaw = Number(raw?.scoring?.ppr);
  return {
    teams,
    seat: clampInt(raw?.seat, 1, teams, Math.min(base.seat, teams)),
    slots,
    scoring: {
      ppr: [0, 0.5, 1].includes(pprRaw) ? pprRaw : base.scoring.ppr,
      passTd: clampInt(raw?.scoring?.passTd, 3, 6, base.scoring.passTd),
      superflex: raw?.scoring?.superflex === true,
    },
  };
};

export const starterCount = (cfg) =>
  POSITIONS.reduce((n, pos) => n + (cfg.slots[pos] || 0), 0);

export const roundCount = (cfg) => Math.max(1, starterCount(cfg) + cfg.slots.BN);

// Snake order. Odd rounds count up from the top, even rounds come back down.
export const pickNumbers = (cfg) =>
  Array.from({ length: roundCount(cfg) }, (_, r) =>
    r % 2 === 0 ? r * cfg.teams + cfg.seat : (r + 1) * cfg.teams - cfg.seat + 1
  );

// The nine (or however many) starting slots, in the order they're filled.
export const starterSlots = (cfg) => {
  const out = [];
  const push = (pos, n, label) => {
    for (let i = 0; i < n; i += 1) out.push({ pos, label: n > 1 ? `${label}${i + 1}` : label });
  };
  push("QB", cfg.slots.QB, "QB");
  push("RB", cfg.slots.RB, "RB");
  push("WR", cfg.slots.WR, "WR");
  push("TE", cfg.slots.TE, "TE");
  push("FLEX", cfg.slots.FLEX, "FLEX");
  push("DST", cfg.slots.DST, "D/ST");
  push("K", cfg.slots.K, "K");
  return out;
};

export const flexEligible = (cfg) =>
  cfg.scoring.superflex ? [...FLEX_ELIGIBLE, "QB"] : FLEX_ELIGIBLE;

// How many of each position to actually draft, starters plus a share of the
// bench. Bench goes to running backs and receivers, because those are the
// positions where the bench spots earn anything.
export const positionTargets = (cfg) => {
  const bn = cfg.slots.BN;
  const flex = cfg.slots.FLEX;
  return {
    QB: cfg.slots.QB + (cfg.scoring.superflex ? 1 : 0),
    RB: cfg.slots.RB + Math.ceil(bn * 0.4) + Math.ceil(flex / 2),
    WR: cfg.slots.WR + Math.ceil(bn * 0.5) + Math.floor(flex / 2),
    TE: cfg.slots.TE,
    DST: cfg.slots.DST,
    K: cfg.slots.K,
  };
};

// The hand-written pick tree assumes this exact draft. Anything else gets the
// generic best-available engine instead.
export const treeFits = (cfg) =>
  cfg.teams === 10 &&
  cfg.seat === 2 &&
  roundCount(cfg) === 14 &&
  cfg.scoring.ppr === 0.5 &&
  !cfg.scoring.superflex;

export const scoringLabel = (cfg) => {
  const ppr = cfg.scoring.ppr === 1 ? "full PPR" : cfg.scoring.ppr === 0.5 ? "half PPR" : "standard";
  return `${cfg.teams} team · snake · ${ppr}${cfg.scoring.superflex ? " · superflex" : ""} · ${cfg.slots.BN} bench`;
};

export const configFromPreset = (key) => normalizeConfig(PRESETS[key]?.config || PRESETS.josh.config);
