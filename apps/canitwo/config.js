// ─── CanITwo Configuration ───────────────────────────────────────────────────
//   • Map tiles come from OpenStreetMap (no key).
//   • Nearby places come from Google Places API (New) when a key is set below,
//     with the free Overpass API as automatic fallback (and as the only source
//     if the key is ever removed).
//   • Firebase web config lives in js/store.js (web config values are public).

window.APP_CONFIG = {
  // Google Places API (New) key — safe to publish: restricted to
  // joshcocciardi.com referrers and to the Places API only.
  // Set to '' to disable and use Overpass exclusively.
  google_places_api_key: 'AIzaSyAa-LSU-Xca_2q-wCcuLpho4OXlE3Ibwmc',

  // Each group is one Nearby Search request (max 20 results each).
  // Grouped so a "Search this area" tap costs 3 requests → ~1,600 free
  // searches/month on the Places API (New) Pro SKU free tier.
  google_type_groups: [
    ['gas_station', 'convenience_store', 'supermarket', 'grocery_store', 'rest_stop', 'truck_stop'],
    ['cafe', 'coffee_shop', 'restaurant', 'fast_food_restaurant', 'bakery', 'bar'],
    ['shopping_mall', 'department_store', 'hotel', 'motel', 'library', 'public_bathroom'],
  ],

  // Google place type → category key (first match in the types array wins).
  google_type_to_category: {
    public_bathroom: 'toilets',
    gas_station: 'fuel',
    truck_stop: 'fuel',
    rest_stop: 'rest_area',
    convenience_store: 'convenience',
    supermarket: 'supermarket',
    grocery_store: 'supermarket',
    cafe: 'cafe',
    coffee_shop: 'cafe',
    bakery: 'cafe',
    fast_food_restaurant: 'fast_food',
    restaurant: 'restaurant',
    bar: 'bar',
    pub: 'bar',
    shopping_mall: 'mall',
    department_store: 'mall',
    hotel: 'hotel',
    motel: 'hotel',
    library: 'library',
  },
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

  // Amenity tags a reporter can attach when a place has a bathroom.
  report_tags: [
    { key: 'accessible',     emoji: '♿',  label: 'Accessible' },
    { key: 'changing_table', emoji: '🚼', label: 'Changing table' },
    { key: 'code_needed',    emoji: '🔑', label: 'Code/key needed' },
    { key: 'customers_only', emoji: '🛍️', label: 'Customers only' },
    { key: 'gender_neutral', emoji: '⚧️', label: 'Gender-neutral' },
  ],

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
