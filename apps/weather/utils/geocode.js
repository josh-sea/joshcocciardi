// Place search and reverse lookup that work in the browser. expo-location's
// geocodeAsync and reverseGeocodeAsync aren't available on the web, so these
// use two free, keyless services that allow calls straight from a browser:
//   - Open-Meteo geocoding for "Beacon", "Beacon, NY" or "12508"
//   - OpenStreetMap's Nominatim for "where am I" (one call per tap of
//     Current Location, well inside its usage policy)

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const STATE_ABBR = Object.fromEntries(Object.entries(US_STATES).map(([abbr, name]) => [name, abbr]));

const norm = (s) => String(s || '').trim().toLowerCase();

// "Beacon, NY" style label: state abbreviation in the US, country elsewhere.
const placeLabel = (city, region, countryCode, country) => {
  if (!city) return region || country || 'Unknown location';
  if (countryCode === 'US') return `${city}, ${STATE_ABBR[region] || region}`;
  return [city, region || country].filter(Boolean).join(', ');
};

/**
 * Search for places matching what the user typed.
 * @returns {Promise<Array>} up to 5 { id, name, zipcode, latitude, longitude, fullAddress }
 */
export const searchPlaces = async (query) => {
  const text = String(query || '').trim();
  if (!text) return [];

  const [first, ...rest] = text.split(',').map((s) => s.trim());
  const qualifier = norm(rest.join(' '));
  const isZip = /^\d{5}(-\d{4})?$/.test(first);

  const params = new URLSearchParams({ name: isZip ? first.slice(0, 5) : first, count: '20', language: 'en', format: 'json' });
  if (isZip) params.set('countryCode', 'US');
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`geocode_${res.status}`);
  let results = (await res.json()).results || [];

  if (qualifier) {
    const state = US_STATES[qualifier.toUpperCase()];
    const matches = (r) =>
      [r.admin1, r.admin2, r.country, r.country_code].some((v) => norm(v) === qualifier || (state && norm(v) === norm(state))) ||
      norm(r.admin1).startsWith(qualifier) ||
      norm(r.country).startsWith(qualifier);
    results = results.filter(matches);
  }

  return results.slice(0, 5).map((r, i) => ({
    id: `search-${i}`,
    name: placeLabel(r.name, r.admin1, r.country_code, r.country),
    zipcode: isZip ? first.slice(0, 5) : r.postcodes && r.postcodes.length === 1 ? r.postcodes[0] : '',
    latitude: r.latitude,
    longitude: r.longitude,
    fullAddress: [r.name, r.admin2, r.admin1, r.country].filter(Boolean).join(', '),
  }));
};

/**
 * Name for a coordinate, such as "Beacon, NY".
 * @returns {Promise<string|null>}
 */
export const reverseGeocode = async (latitude, longitude) => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '10',
    addressdetails: '1',
    'accept-language': 'en',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
  if (!res.ok) return null;
  const a = (await res.json()).address || {};
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county;
  if (!city && !a.state) return null;
  return placeLabel(city, a.state, String(a.country_code || '').toUpperCase(), a.country);
};
