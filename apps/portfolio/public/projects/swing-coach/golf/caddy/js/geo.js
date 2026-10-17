/**
 * Distances, bearings and terrain height.
 *
 * A golf hole is small enough that a sphere is plenty: over 600 yards the
 * error from ignoring the earth's flattening is well under a yard, which is
 * far inside what a phone's GPS can tell you anyway.
 */

const R_EARTH_M = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const M_PER_YARD = 0.9144;
export const yards = (metres) => metres / M_PER_YARD;
export const metres = (yds) => yds * M_PER_YARD;
export const feet = (m) => m / 0.3048;

/** Great-circle distance between two {lat, lng} points, in metres. */
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, in degrees clockwise from north. */
export function bearing(a, b) {
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `dist` metres from `a` along `brng`. */
export function destination(a, brng, dist) {
  const d = dist / R_EARTH_M;
  const br = rad(brng);
  const lat1 = rad(a.lat), lng1 = rad(a.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

/** Total length in metres of a path of points. */
export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/**
 * Walk `dist` metres along a path and return where you end up, plus which
 * segment you are on. Past the end it returns the last point. This is what
 * puts the "you should land about here" marker on a dogleg.
 */
export function pointAlongPath(points, dist) {
  if (!points.length) return null;
  if (points.length === 1 || dist <= 0) return { ...points[0], segment: 0 };
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const leg = distance(points[i - 1], points[i]);
    if (walked + leg >= dist) {
      const into = dist - walked;
      const p = destination(points[i - 1], bearing(points[i - 1], points[i]), into);
      return { ...p, segment: i - 1 };
    }
    walked += leg;
  }
  return { ...points[points.length - 1], segment: points.length - 2 };
}

/**
 * Terrain height for a list of points, in metres, from Open-Meteo's DEM.
 *
 * Deliberately not the phone's own altitude reading: GPS altitude is good to
 * maybe 10 to 30 metres vertically, which is useless for a hole that climbs
 * 20 feet. A terrain model is wrong in a different way — it does not know
 * about a raised green — but it is wrong by a lot less.
 */
export async function elevations(points, { fetchImpl = fetch } = {}) {
  if (!points.length) return [];
  const lat = points.map((p) => p.lat.toFixed(5)).join(",");
  const lng = points.map((p) => p.lng.toFixed(5)).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`elevation lookup failed (${res.status})`);
  const body = await res.json();
  if (!Array.isArray(body.elevation)) throw new Error("elevation lookup returned nothing usable");
  return body.elevation;
}

/**
 * How much longer a shot plays for the climb between you and the target.
 *
 * TrackMan's one-to-one rule: a yard of elevation is worth about a yard of
 * distance, so a green 10 yards above you plays 10 yards longer. Other rules
 * in circulation are three times smaller, and the true answer depends on the
 * shot, so this is a starting point rather than a measurement.
 */
export function elevationAdjustmentYards(riseMetres) {
  return yards(riseMetres);
}
