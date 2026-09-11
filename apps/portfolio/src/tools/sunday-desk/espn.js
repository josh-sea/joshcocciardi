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
import { isBench, slotName } from "./players";

const callEspn = httpsCallable(functions, "espnFantasy");

// Season-level reads that ESPN serves to anyone. No cookies, no proxy — which
// is why the bye planner keeps working after an espn_s2 goes stale.
const PUBLIC_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

export {
  POSITIONS,
  SLOTS,
  PRO_TEAMS,
  posName,
  slotName,
  teamAbbrev,
  isBench,
  injuryLabel,
  weekPoints,
  fullName,
} from "./players";


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

/* Bye weeks, straight from ESPN's public pro-team schedule. Returns a map of
   proTeamId -> bye week; teams with no bye listed are simply absent. */
export const fetchByeWeeks = async (season) => {
  let res;
  try {
    res = await fetch(`${PUBLIC_BASE}/${Number(season)}?view=proTeamSchedules_wl`);
  } catch (e) {
    throw new EspnError("other", "Couldn't reach ESPN for the NFL schedule.");
  }
  if (!res.ok) throw new EspnError("other", `ESPN returned ${res.status} for the NFL schedule.`);
  const data = await res.json();
  const teams = data?.settings?.proTeams || [];
  const byTeam = {};
  teams.forEach((t) => {
    if (t && t.id !== undefined && t.byeWeek) byTeam[t.id] = t.byeWeek;
  });
  if (!Object.keys(byTeam).length) {
    throw new EspnError("other", "ESPN's schedule came back without any bye weeks in it.");
  }
  return byTeam;
};

/* League transaction history: the adds, drops and waiver claims everyone has
   made. Shape varies more than the other views, so callers parse defensively. */
export const fetchTransactions = ({ leagueId, season, creds }) =>
  fetchViews({
    leagueId,
    season,
    views: ["mTransactions2"],
    creds,
    filter: {
      transactions: {
        filterType: { value: ["WAIVER", "FREEAGENT", "ROSTER"] },
        limit: 100,
        offset: 0,
        sortDate: { sortPriority: 1, sortAsc: false },
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
