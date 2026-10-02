// Pure helpers for Seasonal Box HQ: season dates, milestone risk, and
// formatting. No React and no Firebase, so test/seasonal-box.test.mjs can
// import them directly.

import { STAGES } from "./seed.js";

const DAY = 86400000;

/* Dates are calendar days ("YYYY-MM-DD"), handled at UTC noon so adding weeks
   never lands on the wrong day across a DST change. */
export const parseDay = (iso) => {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toDay = (d) => d.toISOString().slice(0, 10);

export const addDays = (iso, days) => {
  const d = parseDay(iso);
  return d ? toDay(new Date(d.getTime() + days * DAY)) : null;
};

export const today = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const daysBetween = (fromIso, toIso) => {
  const a = parseDay(fromIso);
  const b = parseDay(toIso);
  if (!a || !b) return null;
  return Math.round((b - a) / DAY);
};

/* Milestone dates counted back (or forward) from the ship date. */
export const milestonesFor = (shipDate, timeline) =>
  (timeline || []).map((m) => ({ ...m, date: addDays(shipDate, Math.round(m.weeks * 7)) }));

export const lockDateFor = (shipDate, timeline) => milestonesFor(shipDate, timeline).find((m) => m.key === "lock")?.date || null;

/* A milestone is met once the season has reached the stage it stands for
   (a completed season has met all of them). Otherwise it is overdue past its
   date, at risk inside the warning window, and upcoming before that. */
export const milestoneStatus = (m, stage, complete, todayIso, warnDays = 7) => {
  if (complete || stage >= m.reach) return "done";
  const left = daysBetween(todayIso, m.date);
  if (left === null) return "upcoming";
  if (left < 0) return "overdue";
  if (left <= warnDays) return "at-risk";
  return "upcoming";
};

export const seasonTimeline = (season, timeline, todayIso, warnDays) => {
  if (!season?.shipDate) return [];
  const complete = season.status === "complete";
  return milestonesFor(season.shipDate, timeline).map((computed) => {
    // An explicit lock date on the season wins over the computed one.
    const m = computed.key === "lock" && season.lockDate ? { ...computed, date: season.lockDate } : computed;
    return {
      ...m,
      status: milestoneStatus(m, Number(season.stage) || 1, complete, todayIso, warnDays),
      daysLeft: daysBetween(todayIso, m.date),
    };
  });
};

/* The next milestone that isn't met, for list views. */
export const nextMilestone = (season, timeline, todayIso, warnDays) =>
  seasonTimeline(season, timeline, todayIso, warnDays).find((m) => m.status !== "done") || null;

export const stageInfo = (n) => STAGES.find((s) => s.n === Number(n)) || STAGES[0];

const SEASON_NAMES = [
  [3, "Spring"],
  [6, "Summer"],
  [9, "Fall"],
  [11, "Holiday"],
];

/* "Holiday 2027" for a ship date in November, and so on. */
export const suggestSeasonName = (shipDate) => {
  const d = parseDay(shipDate);
  if (!d) return "";
  const month = d.getUTCMonth() + 1;
  let name = "Winter";
  for (const [m, n] of SEASON_NAMES) if (month >= m) name = n;
  if (month < 3) name = "Winter";
  return `${name} ${d.getUTCFullYear()}`;
};

export const usd = (n, { cents = true } = {}) => {
  const v = Number(n) || 0;
  if (cents && v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
};

export const parseJson = (s, fallback = null) => {
  if (typeof s !== "string") return fallback;
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
};

export const toMillis = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : t ? Date.parse(t) || 0 : 0);

export const ago = (t, now = Date.now()) => {
  const ms = toMillis(t);
  if (!ms) return "";
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const LEVEL_RANK = { red: 0, yellow: 1, green: 2 };

/* Approval inbox order: soonest deadline first, red before yellow at equal
   deadlines, oldest first after that. No deadline sorts after any deadline. */
export const sortInbox = (proposals) =>
  [...proposals].sort((a, b) => {
    const da = a.deadline ? parseDay(String(a.deadline).slice(0, 10))?.getTime() ?? Infinity : Infinity;
    const db = b.deadline ? parseDay(String(b.deadline).slice(0, 10))?.getTime() ?? Infinity : Infinity;
    if (da !== db) return da - db;
    const la = LEVEL_RANK[a.level] ?? 3;
    const lb = LEVEL_RANK[b.level] ?? 3;
    if (la !== lb) return la - lb;
    return toMillis(a.createdAt) - toMillis(b.createdAt);
  });

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
