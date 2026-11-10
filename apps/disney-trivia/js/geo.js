/* Where Am I — the real-world half.
 *
 * The game used to judge a guess as a point on a drawn park map. That map is
 * artwork: not to scale, not north-up, and different proportions per park, so
 * "how far out were you" could only ever be a share of the picture.
 *
 * Judging against coordinates makes the answer mean something. Thirty metres
 * is thirty metres in every park, it is the same number the photo's own GPS
 * gives, and it does not depend on which drawing a deck happens to use.
 *
 * Pure. No DOM, no network, no map library.
 */

/* Park centres, and how far the furthest attraction sits from each.
 *
 * Derived from parks/attractions.json, which carries a real latitude and
 * longitude for all 99 attractions, by averaging each park's rides. Written
 * down rather than computed at load because this file has no business
 * fetching the catalogue, and because these move roughly never.
 *
 *   mk  379m   ep  518m   hs  335m   ak  687m
 *
 * The parks are far enough apart for that to be unambiguous: the closest two
 * centres, EPCOT and Hollywood Studios, are 1,991m apart, which is nearly
 * three times the widest park's reach.
 */
export const PARK_CENTRES = {
  mk: { lat: 28.41932, lng: -81.58111 },
  ep: { lat: 28.37194, lng: -81.54997 },
  hs: { lat: 28.35682, lng: -81.56087 },
  ak: { lat: 28.35930, lng: -81.59022 },
};

/* How near a point has to be to count as inside a park at all. Generous
 * against the widest park (687m) and still well inside half the distance to
 * the nearest neighbouring park, so the two tests cannot disagree.
 */
export const PARK_REACH_M = 900;

const R = 6371008.8;   // mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

export const isPoint = (p) => !!p
  && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/* Great-circle distance in metres.
 *
 * Haversine rather than the flat approximation. Over a park the two agree to
 * well under a metre, but the flat version needs a cos(latitude) term that is
 * easy to leave out, and leaving it out is a 12% error in longitude at this
 * latitude: enough to call a correct guess wrong.
 */
export function metresBetween(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* Which park a point is in, or null.
 *
 * Nearest centre, then a reach check. Nearest-first rather than testing each
 * park's radius in turn, because overlapping radii would make the answer
 * depend on the order the parks happen to be listed in.
 */
export function parkAt(point, reach = PARK_REACH_M) {
  if (!isPoint(point)) return null;
  let best = null;
  for (const [key, centre] of Object.entries(PARK_CENTRES)) {
    const d = metresBetween(point, centre);
    if (best === null || d < best.d) best = { key, d };
  }
  return best && best.d <= reach ? best.key : null;
}

/* ── judging ───────────────────────────────────────────────────────────────
 *
 * In metres, which is the point of all this. The defaults are paced to a
 * theme park rather than to a map: 60m is "you found the right spot", about
 * the length of a queue building, and 20m is close enough to be showing off.
 */
export const WITHIN_M = 60;
export const BULLSEYE_M = 20;

export function judgeGeo(guess, answer, within = WITHIN_M, bullseye = BULLSEYE_M) {
  const distance = metresBetween(guess, answer);
  if (distance === null) {
    return { distance: null, within: false, bullseye: false, rightPark: false };
  }
  /* The park is derived from the answer rather than stored beside it, so a
   * round cannot claim one park and sit in another.
   */
  const where = parkAt(answer);
  return {
    distance,
    within: distance <= within,
    bullseye: distance <= bullseye,
    rightPark: !where || parkAt(guess) === where,
  };
}

/* How far out, for a human. Metres up close, because that is the scale the
 * game is played at, and a tenth of a kilometre past that rather than four
 * digits of false precision.
 */
export function offWords(metres) {
  if (!Number.isFinite(metres)) return '';
  if (metres < 10) return `${Math.round(metres)} m`;
  if (metres < 1000) return `${Math.round(metres / 5) * 5} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
