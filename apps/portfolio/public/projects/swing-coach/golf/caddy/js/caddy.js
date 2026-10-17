/**
 * The caddy's opinion: which club, what to aim at, and why.
 *
 * It plans the hole backwards. Par says how many shots you get to the green
 * (par minus two, leaving two putts), and the last of those wants to be a
 * comfortable full swing rather than whatever is left over. So the shots
 * before it are sized to set that up, instead of just hitting as far as
 * possible and hoping.
 *
 * For a beginner that mostly means: take less club, aim at the middle, and
 * stop trying to reach greens you cannot reach.
 */

import { playingDistance, rankedBag, clubLabel } from "./clubs.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Shots you are meant to have left to reach the green. */
export function shotsToGreen(par, shotNumber) {
  const planned = Math.max(1, par - 2);
  return Math.max(1, planned - (shotNumber - 1));
}

/**
 * The approach distance to try to leave yourself. A full swing with a scoring
 * club beats a half wedge, so this picks the longest wedge or short iron in
 * the bag rather than the shortest club in it.
 */
export function preferredApproach(ranked) {
  const scoring = ranked.filter((e) => ["wedge", "iron"].includes(e.club.category) && e.yards >= 60);
  if (scoring.length) return scoring[Math.max(0, scoring.length - 2)].yards;
  return ranked.length ? ranked[ranked.length - 1].yards : 90;
}

/** The club whose distance sits closest to what this shot needs. */
function closestClub(ranked, target) {
  let best = null, bestGap = Infinity;
  for (const e of ranked) {
    const gap = Math.abs(e.yards - target);
    if (gap < bestGap) { bestGap = gap; best = e; }
  }
  return best;
}

/**
 * The main call.
 *
 * `yardsToTarget` is flat, map-measured distance. `riseYards` is how much
 * higher the target sits, already converted by geo. Returns the club, the
 * distance to plan the shot for, and plain-language reasoning.
 */
export function recommend({
  yardsToTarget,
  riseYards = 0,
  par = 4,
  shotNumber = 1,
  bag = [],
  handicap = 28,
  skill = "beginner",
  distanceOpts,
}) {
  const ranked = rankedBag(bag, handicap, distanceOpts);
  if (!ranked.length) {
    return { ok: false, reason: "There are no clubs in your bag yet. Add some on the Bag tab." };
  }

  const playsLike = Math.max(0, Math.round(yardsToTarget + riseYards));
  const longest = ranked[0];
  const shortest = ranked[ranked.length - 1];
  const remaining = shotsToGreen(par, shotNumber);
  const approach = preferredApproach(ranked);

  // What decides this is whether the green is actually in range, not how many
  // shots par says you get. Sizing off the par budget alone had the caddy
  // laying up to 43 yards on a 110 yard shot, because the budget said two
  // shots and it dutifully split them — when any player would just hit the
  // 110 yard club. If you can reach it, go at it.
  const canReach = playsLike <= longest.yards;
  let target;
  let intent;
  if (canReach) {
    target = playsLike;
    intent = "green";
  } else {
    intent = "layup";
    // Out of range. If par still allows more shots, size this one so the last
    // is a comfortable full swing; if it doesn't, just go as far as you can.
    target = remaining <= 1 ? longest.yards : (playsLike - approach) / (remaining - 1);
    if (!Number.isFinite(target) || target <= 0) target = longest.yards;
  }

  const capped = Math.max(shortest.yards, Math.min(target, longest.yards));
  const pick = closestClub(ranked, capped);
  const shortOfGreen = !canReach;
  const leaves = Math.max(0, playsLike - pick.yards);

  const notes = [];
  if (Math.abs(riseYards) >= 3) {
    notes.push(
      riseYards > 0
        ? `The target sits about ${Math.round(riseYards)} yards above you, so it plays ${playsLike} rather than ${Math.round(yardsToTarget)}.`
        : `The target sits about ${Math.round(-riseYards)} yards below you, so it plays ${playsLike} rather than ${Math.round(yardsToTarget)}.`
    );
  }

  let strategy;
  if (shortOfGreen) {
    const lead =
      `You cannot reach from here — your longest club goes about ${longest.yards} yards and the green plays ${playsLike}. `;
    strategy = remaining <= 1 || leaves <= approach * 1.3
      ? lead + `Hit ${pick.club.label} down the middle and leave yourself a shot you like, rather than swinging out of your shoes and finding trouble.`
      : lead + `Play ${pick.club.label} about ${pick.yards} yards up the fairway, which leaves roughly ${leaves} yards` +
        (remaining === 2 ? ` in — close to a full ${closestClub(ranked, approach).club.label}.` : ` and ${remaining - 1} more shots to cover it.`);
  } else {
    strategy = `${pick.club.label} is your distance here, about ${pick.yards} yards against a ${playsLike} yard shot.`;
  }

  const aim =
    skill === "beginner"
      ? "Aim at the middle and just try to hit it straight. Nothing clever."
      : skill === "intermediate"
        ? "Pick a specific target on the fairway rather than aiming at the whole hole."
        : "Favour the side that leaves the better angle in.";

  const gap = pick.yards - capped;
  if (Math.abs(gap) > 15) {
    notes.push(
      gap > 0
        ? `There's no club in the bag that stops at ${Math.round(capped)} yards — ${pick.club.label} is the closest and it goes ${pick.yards}, so swing within yourself.`
        : `Nothing in the bag quite covers ${Math.round(capped)} yards — ${pick.club.label} is the closest at ${pick.yards}.`
    );
  }
  if (pick.source === "estimate") {
    notes.push(`That ${pick.club.label} number is still an estimate. Log a few shots with it and the caddy will learn your real one.`);
  }

  return {
    ok: true,
    club: pick.club,
    clubLabel: pick.club.label,
    clubYards: pick.yards,
    source: pick.source,
    sourceLabel: pick.label,
    playsLike,
    flatYards: Math.round(yardsToTarget),
    riseYards: Math.round(riseYards),
    targetYards: Math.round(capped),
    intent,
    shotsRemaining: remaining,
    canReach: !shortOfGreen,
    strategy,
    aim,
    notes,
    spoken: `${pick.club.label}. ${strategy} ${aim}`,
  };
}

export { clubLabel, playingDistance };

/* ==================================================================
   Playing a hole without marking the flag
   ------------------------------------------------------------------
   Most of the time you do not want to fiddle with a map. Par plus the
   tee you are on is enough to estimate how long the hole is, and the
   straight line from the tee to where your ball now sits is enough to
   estimate how much of it you have covered. Drop a pin and the real
   measurement takes over.
   ================================================================== */

/**
 * Typical length of a hole at each par, from the middle tees.
 *
 * The USGA defines par by effective playing length — for men, up to 250
 * yards is a par 3, 251 to 470 a par 4, 471 to 690 a par 5 — so these sit
 * inside those bands rather than at their edges, because real courses
 * cluster well short of the maximum.
 */
const PAR_YARDS = { 3: 160, 4: 380, 5: 510, 6: 620 };

/** Roughly how much each tee stretches or shortens a hole. */
const TEE_SCALE = {
  black: 1.10, blue: 1.03, white: 0.95, gold: 0.87, red: 0.80,
};

export function estimatedHoleYards(par, teeColor = "white") {
  const base = PAR_YARDS[par] ?? PAR_YARDS[4];
  const scale = TEE_SCALE[String(teeColor).toLowerCase()] ?? 1;
  return Math.round(base * scale);
}

/**
 * What is left to the green, and how sure we are of it.
 *
 * `pinYards` wins whenever a flag has been dropped. Otherwise it is the
 * estimated hole length less the ground already covered, measured as the
 * straight line from the tee rather than the sum of the shots — a sliced
 * drive travels 200 yards without getting 200 yards closer.
 */
export function remainingYards({ par, teeColor, pinYards = null, progressYards = 0 }) {
  if (Number.isFinite(pinYards)) {
    return { yards: Math.max(0, Math.round(pinYards)), source: "pin", label: "to the flag you dropped" };
  }
  const hole = estimatedHoleYards(par, teeColor);
  const left = Math.max(0, Math.round(hole - progressYards));
  return {
    yards: left,
    source: "par",
    label: progressYards > 0
      ? `estimated: a par ${par} off the ${teeColor} tees is about ${hole} yards, and you have covered ${Math.round(progressYards)}`
      : `estimated: a par ${par} off the ${teeColor} tees is about ${hole} yards`,
  };
}
