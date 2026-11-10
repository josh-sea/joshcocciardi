/* Where Am I — the real map.
 *
 * Leaflet and OpenStreetMap tiles, loaded on demand and never at page load.
 * The ticket book's whole trick is that it opens instantly with no network,
 * and a map library on the critical path would cost that for a game most
 * visitors never open.
 *
 * OSM has unusually good Disney World data, down to the walkways, so a guess
 * can be placed by looking at the paths rather than by recognising a drawing.
 * Attribution is required by their terms and is shown on the map itself,
 * which Leaflet does for us as long as the layer is configured with it.
 *
 * This file knows nothing about the game. It shows a map, takes a tap, and
 * draws pins where it is told.
 */

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';

let loading = null;

/* Load Leaflet once. Both the script and its stylesheet: without the CSS the
 * tiles are positioned by inline transforms that have nothing to anchor to,
 * and the map renders as a vertical stack of images rather than a map.
 */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}leaflet.css`;
    document.head.append(css);

    const js = document.createElement('script');
    js.src = `${LEAFLET}leaflet.js`;
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet did not load')));
    js.onerror = () => reject(new Error('Could not reach the map service'));
    document.head.append(js);
  }).catch((err) => { loading = null; throw err; });

  return loading;
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/* A map in `el`, centred on `centre`.
 *
 * Returns a small handle rather than the Leaflet map, so the rest of the
 * game never holds a Leaflet object and this can be swapped for another
 * library without touching it.
 */
export async function makeMap(el, { centre, zoom = 16, onPick = null } = {}) {
  const L = await loadLeaflet();

  const map = L.map(el, { zoomControl: true, attributionControl: true })
    .setView([centre.lat, centre.lng], zoom);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(map);

  const marks = {};

  /* A dot rather than Leaflet's default marker: the default is a PNG pin
   * fetched from the CDN by a relative path, which 404s as often as not when
   * the library is loaded from one place and the page served from another.
   * A div we style ourselves has no such dependency.
   */
  const dot = (point, kind) => L.marker([point.lat, point.lng], {
    icon: L.divIcon({ className: `wa-dot wa-dot-${kind}`, iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false,
    interactive: false,
  });

  if (onPick) {
    map.on('click', (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }));
  }

  return {
    /* Put a named pin down, replacing any previous one of that name. Named
     * so "the guess" and "the answer" can be moved independently without the
     * caller tracking Leaflet layers.
     */
    pin(kind, point) {
      if (marks[kind]) { map.removeLayer(marks[kind]); delete marks[kind]; }
      if (!point) return;
      marks[kind] = dot(point, kind).addTo(map);
    },
    /* A circle showing how close counts, so "within 60 metres" is a thing
     * you can see rather than a number to take on trust.
     */
    ring(point, metres) {
      if (marks.ring) { map.removeLayer(marks.ring); delete marks.ring; }
      if (!point) return;
      marks.ring = L.circle([point.lat, point.lng], {
        radius: metres, color: '#7BD88F', weight: 1, fillOpacity: 0.08, interactive: false,
      }).addTo(map);
    },
    /* Frame both pins once the answer is shown, so the player sees how far
     * out they were without pinching around to find the other one.
     */
    frame(points, pad = 60) {
      const real = (points || []).filter((p) => p && Number.isFinite(p.lat));
      if (!real.length) return;
      if (real.length === 1) { map.setView([real[0].lat, real[0].lng], 17); return; }
      map.fitBounds(real.map((p) => [p.lat, p.lng]), { padding: [pad, pad], maxZoom: 18 });
    },
    recentre(point, z = zoom) { map.setView([point.lat, point.lng], z); },
    // Leaflet measures its container on creation. In a tab that was hidden
    // then shown, that measurement was of a box with no size.
    resize() { map.invalidateSize(); },
    lock(on) { [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom]
      .forEach((h) => (on ? h.disable() : h.enable())); },
    destroy() { map.remove(); },
  };
}
