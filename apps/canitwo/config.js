// ─── CanITwo Configuration ───────────────────────────────────────────────────
// No API keys required:
//   • Map tiles come from OpenStreetMap.
//   • Nearby places (gas stations, stores, cafes…) come from the Overpass API.
//   • Firebase web config lives in js/store.js (web config values are public).

window.APP_CONFIG = {
  // Overpass endpoints — queried in parallel, fastest response wins.
  overpass_endpoints: [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ],

  // Max radius (meters) for an Overpass "search this area" query.
  overpass_max_radius_m: 3000,

  // Minimum zoom before "Search this area" is allowed (keeps queries small).
  overpass_min_zoom: 13,

  // Max radius (km) for loading rated places from Firestore around the map view.
  firestore_max_radius_km: 60,

  // OSM tag → category. Order matters: first match wins.
  categories: [
    { key: 'toilets',     match: t => t.amenity === 'toilets',                              label: 'Public Toilet',     emoji: '🚻' },
    { key: 'fuel',        match: t => t.amenity === 'fuel',                                 label: 'Gas Station',       emoji: '⛽' },
    { key: 'rest_area',   match: t => t.highway === 'rest_area' || t.highway === 'services',label: 'Rest Area',         emoji: '🛣️' },
    { key: 'cafe',        match: t => t.amenity === 'cafe',                                 label: 'Cafe',              emoji: '☕' },
    { key: 'fast_food',   match: t => t.amenity === 'fast_food',                            label: 'Fast Food',         emoji: '🍔' },
    { key: 'restaurant',  match: t => t.amenity === 'restaurant' || t.amenity === 'food_court', label: 'Restaurant',    emoji: '🍽️' },
    { key: 'bar',         match: t => t.amenity === 'pub' || t.amenity === 'bar',           label: 'Bar / Pub',         emoji: '🍺' },
    { key: 'convenience', match: t => t.shop === 'convenience',                             label: 'Convenience Store', emoji: '🏪' },
    { key: 'supermarket', match: t => t.shop === 'supermarket',                             label: 'Supermarket',       emoji: '🛒' },
    { key: 'mall',        match: t => t.shop === 'mall' || t.shop === 'department_store',   label: 'Mall',              emoji: '🏬' },
    { key: 'hotel',       match: t => t.tourism === 'hotel' || t.tourism === 'motel',       label: 'Hotel',             emoji: '🏨' },
    { key: 'library',     match: t => t.amenity === 'library',                              label: 'Library',           emoji: '📚' },
    { key: 'other',       match: () => true,                                                label: 'Place',             emoji: '📍' },
  ],
};
