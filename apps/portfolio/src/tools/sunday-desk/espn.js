// ---------------------------------------------------------------------------
// ESPN Fantasy client.
//
// Every league read goes through the espnFantasy callable (functions/espn.js),
// because the browser physically cannot attach ESPN's cookies to a cross-site
// request. This module owns the calls and the translation from ESPN's id-heavy
// JSON into names a human can read.
//
// The id maps below come from the shape ESPN's own clients use. Anything not
// in a map renders as its raw id rather than blowing up, so a value ESPN adds
// later shows up as "slot 24" instead of an empty row.
// ---------------------------------------------------------------------------

import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

const callEspn = httpsCallable(functions, "espnFantasy");

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

/* Translate the callable's failures into something the UI can branch on. The
   expired-cookie case is the one that actually happens, so it gets its own
   code rather than being buried in a message. */
export class EspnError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const toEspnError = (e) => {
  const msg = e?.message || "";
  if (msg.includes("espn_auth_failed")) {
    return new EspnError(
      "auth",
      "ESPN rejected the saved cookies. The espn_s2 value has almost certainly aged out — paste a fresh one in Setup."
    );
  }
  if (msg.includes("no_credentials")) {
    return new EspnError("missing", "No ESPN cookies saved yet. Add them in Setup.");
  }
  if (msg.includes("league_not_found")) {
    return new EspnError("notfound", "ESPN has no league with that id for that season.");
  }
  if (e?.code === "functions/unauthenticated") {
    return new EspnError("signedout", "Sign in first.");
  }
  return new EspnError("other", msg || "Something went wrong talking to ESPN.");
};

const request = async (payload) => {
  try {
    const res = await callEspn(payload);
    return res?.data?.data;
  } catch (e) {
    throw toEspnError(e);
  }
};

export const fetchViews = ({ leagueId, season, views, scoringPeriodId, filter, creds }) =>
  request({ leagueId: Number(leagueId), season: Number(season), views, scoringPeriodId, filter, creds });

/* The whole league in one round trip: settings, teams, rosters and the full
   schedule. It is a big response, but it is one request instead of four and
   every screen in the tool reads from it. */
export const fetchLeagueSnapshot = ({ leagueId, season, week, creds }) =>
  fetchViews({
    leagueId,
    season,
    views: ["mTeam", "mRoster", "mSettings", "mMatchupScore"],
    scoringPeriodId: week,
    creds,
  });

/* Free agents and waiver claims, richest first by roster percentage. */
export const fetchAvailable = ({ leagueId, season, week, slotIds, limit = 60, creds }) =>
  fetchViews({
    leagueId,
    season,
    week,
    scoringPeriodId: week,
    views: ["kona_player_info"],
    creds,
    filter: {
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
        ...(slotIds && slotIds.length ? { filterSlotIds: { value: slotIds } } : {}),
        limit,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
      },
    },
  });

/* A minimal call used only to prove the credentials work. */
export const testConnection = ({ leagueId, season, creds }) =>
  fetchViews({ leagueId, season, views: ["mSettings"], creds });

// ---- shaping -------------------------------------------------------------

export const teamName = (team) => {
  if (!team) return "Unknown team";
  if (team.name) return team.name;
  const joined = [team.location, team.nickname].filter(Boolean).join(" ").trim();
  return joined || team.abbrev || `Team ${team.id}`;
};

export const shapeTeams = (league) =>
  (league?.teams || []).map((t) => ({
    id: t.id,
    name: teamName(t),
    abbrev: t.abbrev || "",
    logo: t.logo || null,
    wins: t.record?.overall?.wins ?? 0,
    losses: t.record?.overall?.losses ?? 0,
    ties: t.record?.overall?.ties ?? 0,
    pointsFor: t.record?.overall?.pointsFor ?? 0,
    pointsAgainst: t.record?.overall?.pointsAgainst ?? 0,
    roster: (t.roster?.entries || []).map((e) => ({
      slotId: e.lineupSlotId,
      slot: slotName(e.lineupSlotId),
      bench: isBench(e.lineupSlotId),
      player: e.playerPoolEntry?.player || e.player || null,
    })),
  }));

export const shapeMatchup = (league, week, teamId) => {
  const games = (league?.schedule || []).filter(
    (g) => g.matchupPeriodId === week || g.scoringPeriodId === week
  );
  const mine = games.find((g) => g.home?.teamId === teamId || g.away?.teamId === teamId);
  if (!mine) return null;
  const iAmHome = mine.home?.teamId === teamId;
  const me = iAmHome ? mine.home : mine.away;
  const them = iAmHome ? mine.away : mine.home;
  return { me, them, iAmHome, raw: mine };
};

/* The current week. ESPN reports it on the league status; without it we fall
   back to 1 rather than guessing from the calendar. */
export const currentWeek = (league) =>
  league?.scoringPeriodId || league?.status?.currentMatchupPeriod || 1;
