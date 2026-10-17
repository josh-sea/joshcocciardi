/**
 * The map: satellite tiles, your own position, and the marks you put down.
 *
 * Satellite is the default because street tiles show a golf course as a green
 * blob — you need to see the fairway to aim at it. Esri's World Imagery serves
 * without a key; OpenStreetMap is there as a fallback for anywhere the imagery
 * is stale or cloudy.
 *
 * The target line is deliberately tap-to-add rather than freehand: a dogleg is
 * two or three straight legs, and straight legs are exact to measure. No
 * spline fitting, no smoothing, no guessing what you meant.
 */

import { distance, bearing, destination, pathLength, pointAlongPath, metres, yards } from "./geo.js";

const LAYERS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 21, maxNativeZoom: 19,
  },
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20, maxNativeZoom: 19,
  },
};

const pinIcon = (glyph, cls) =>
  L.divIcon({
    className: `cm ${cls}`,
    html: `<span>${glyph}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

export function createMap(el, { onMapTap } = {}) {
  const map = L.map(el, { zoomControl: true, attributionControl: true, tap: true })
    .setView([39.8283, -98.5795], 4);

  let layerKind = "satellite";
  let tiles = L.tileLayer(LAYERS.satellite.url, LAYERS.satellite).addTo(map);

  const marks = { ball: null, pin: null, me: null, aim: null };
  let accuracyRing = null;
  let line = null;
  let aimLine = null;
  let waypoints = [];

  map.on("click", (e) => onMapTap?.({ lat: e.latlng.lat, lng: e.latlng.lng }));

  function setMark(key, point, glyph, cls, title) {
    if (!point) {
      if (marks[key]) { map.removeLayer(marks[key]); marks[key] = null; }
      return;
    }
    if (marks[key]) marks[key].setLatLng(point);
    else marks[key] = L.marker(point, { icon: pinIcon(glyph, cls), title, zIndexOffset: 400 }).addTo(map);
  }

  return {
    map,

    setLayer(kind) {
      if (!LAYERS[kind] || kind === layerKind) return layerKind;
      map.removeLayer(tiles);
      layerKind = kind;
      tiles = L.tileLayer(LAYERS[kind].url, LAYERS[kind]).addTo(map);
      return layerKind;
    },
    get layer() { return layerKind; },

    /** Blue dot plus the accuracy circle, so a bad fix is visible rather than implied. */
    showMe(point, accuracyMetres) {
      setMark("me", point, "", "me", "You");
      if (accuracyRing) map.removeLayer(accuracyRing);
      accuracyRing = Number.isFinite(accuracyMetres)
        ? L.circle(point, { radius: accuracyMetres, color: "#4ADE80", weight: 1, opacity: 0.6, fillOpacity: 0.08 }).addTo(map)
        : null;
    },

    setBall(p) { setMark("ball", p, "⛳", "ball", "Your ball"); },
    setPin(p) { setMark("pin", p, "🚩", "pin", "The flag"); },
    setAim(p) { setMark("aim", p, "◎", "aim", "Aim here"); },

    centerOn(point, zoom = 17) { map.setView(point, Math.max(map.getZoom(), zoom)); },

    fitTo(points) {
      const real = points.filter(Boolean);
      if (real.length < 2) { if (real[0]) map.setView(real[0], 17); return; }
      map.fitBounds(L.latLngBounds(real.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 19 });
    },

    /* ---- the target line ---- */

    setWaypoints(points) {
      waypoints = points.slice();
      if (line) { map.removeLayer(line); line = null; }
      if (waypoints.length >= 2) {
        line = L.polyline(waypoints.map((p) => [p.lat, p.lng]), {
          color: "#FF6B3D", weight: 4, opacity: 0.9, dashArray: "1 8", lineCap: "round",
        }).addTo(map);
      }
    },
    get waypoints() { return waypoints.slice(); },

    /** The straight leg from the ball out to where the caddy wants it to land. */
    setAimLine(from, to) {
      if (aimLine) { map.removeLayer(aimLine); aimLine = null; }
      if (from && to) {
        aimLine = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
          color: "#4ADE80", weight: 3, opacity: 0.85,
        }).addTo(map);
      }
    },

    invalidate() { setTimeout(() => map.invalidateSize(), 60); },
  };
}

export { distance, bearing, destination, pathLength, pointAlongPath, metres, yards };
