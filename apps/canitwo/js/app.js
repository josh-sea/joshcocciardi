// CanITwo — community bathroom finder.
// Map + UI logic. Data layer lives in js/store.js (window.Store).

(async function () {
  'use strict';

  const cfg = window.APP_CONFIG;
  const Store = await window.StoreReady;

  // ── State ────────────────────────────────────────────────────────────────
  let user = null;            // firebase user or null
  let profile = null;         // { username } or null
  let ratedPlaces = new Map();// placeId -> place doc (from Firestore)
  let osmSpots = new Map();   // placeId -> spot (from Overpass, not yet rated)
  let filters = { minRating: 0, showUnrated: true };
  let currentPlace = null;    // place shown in the bottom sheet
  let reportDraft = null;     // { place, hasBathroom, rating }
  let pendingAfterAuth = null;// callback to run once signed in w/ username
  let addPlaceLatLng = null;

  const $ = id => document.getElementById(id);
  const LS_VIEW = 'canitwo_last_view';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ── Map setup ────────────────────────────────────────────────────────────
  let startView = { lat: 39.5, lng: -98.35, zoom: 4 }; // continental US fallback
  try {
    const saved = JSON.parse(localStorage.getItem(LS_VIEW));
    if (saved && typeof saved.lat === 'number') startView = saved;
  } catch { /* ignore */ }

  const map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([startView.lat, startView.lng], startView.zoom);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const ratedLayer = L.layerGroup().addTo(map);
  const osmLayer = L.layerGroup().addTo(map);
  let meMarker = null;

  // ── Markers ──────────────────────────────────────────────────────────────
  function pinClassFor(p) {
    if ((p.noCount || 0) > (p.yesCount || 0)) return 'pin-none';
    if (typeof p.avgRating !== 'number') return 'pin-new';
    if (p.avgRating >= 4.5) return 'pin-good';
    if (p.avgRating >= 3.5) return 'pin-ok';
    if (p.avgRating >= 2.5) return 'pin-meh';
    return 'pin-bad';
  }

  function pinLabelFor(p) {
    if ((p.noCount || 0) > (p.yesCount || 0)) return '🚫';
    if (typeof p.avgRating === 'number') return p.avgRating.toFixed(1);
    return '🚽';
  }

  function ratedIcon(p) {
    return L.divIcon({
      className: '',
      html: `<div class="pin ${pinClassFor(p)}"><div class="pin-inner">${pinLabelFor(p)}</div></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 36],
    });
  }

  function osmIcon(spot) {
    return L.divIcon({
      className: '',
      html: `<div class="pin-osm">${spot.emoji}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function passesFilter(p) {
    if (filters.minRating <= 0) return true;
    return typeof p.avgRating === 'number' && p.avgRating >= filters.minRating;
  }

  function renderMarkers() {
    ratedLayer.clearLayers();
    osmLayer.clearLayers();

    for (const p of ratedPlaces.values()) {
      if (!passesFilter(p)) continue;
      L.marker([p.lat, p.lng], { icon: ratedIcon(p) })
        .on('click', () => openSheet(p))
        .addTo(ratedLayer);
    }

    if (filters.showUnrated && filters.minRating <= 0) {
      for (const s of osmSpots.values()) {
        if (ratedPlaces.has(s.id)) continue; // already has reports → rated pin
        L.marker([s.lat, s.lng], { icon: osmIcon(s) })
          .on('click', () => openSheet(s))
          .addTo(osmLayer);
      }
    }
  }

  // ── Firestore: load rated places around the current view ────────────────
  let loadTimer = null;
  async function loadRatedPlaces() {
    const b = map.getBounds();
    const c = map.getCenter();
    const radiusKm = Math.min(
      cfg.firestore_max_radius_km,
      Math.max(1, c.distanceTo(b.getNorthEast()) / 1000)
    );
    try {
      const found = await Store.placesNear({ lat: c.lat, lng: c.lng }, radiusKm);
      for (const p of found) ratedPlaces.set(p.id, p);
      renderMarkers();
    } catch (e) {
      console.warn('[CanITwo] loading places failed:', e);
    }
  }

  map.on('moveend', () => {
    const c = map.getCenter();
    localStorage.setItem(LS_VIEW, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
    $('search-area-btn').classList.remove('hidden');
    clearTimeout(loadTimer);
    loadTimer = setTimeout(loadRatedPlaces, 450);
  });

  // ── Overpass: find nearby candidate places ──────────────────────────────
  const OVERPASS_SELECTORS = [
    '["amenity"~"^(fuel|cafe|fast_food|restaurant|food_court|pub|bar|toilets|library)$"]',
    '["shop"~"^(convenience|supermarket|mall|department_store)$"]',
    '["highway"~"^(rest_area|services)$"]',
    '["tourism"~"^(hotel|motel)$"]',
  ];

  function categorize(tags) {
    return cfg.categories.find(c => c.match(tags)) || cfg.categories[cfg.categories.length - 1];
  }

  function addressFrom(tags) {
    const parts = [
      [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
      tags['addr:city'],
    ].filter(Boolean);
    return parts.join(', ') || null;
  }

  // Google Places API (New) Nearby Search. Returns an array of spots, or
  // null if the key is missing / every request failed (→ Overpass fallback).
  async function searchGooglePlaces(center, radius) {
    const key = cfg.google_places_api_key;
    if (!key) return null;
    const results = await Promise.allSettled(cfg.google_type_groups.map(types =>
      fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.shortFormattedAddress',
        },
        body: JSON.stringify({
          includedTypes: types,
          maxResultCount: 20,
          locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
        }),
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
    ));

    let anyOk = false;
    const spots = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') { console.warn('[CanITwo] places group failed:', r.reason?.message); continue; }
      anyOk = true;
      for (const p of r.value.places || []) {
        const lat = p.location?.latitude, lng = p.location?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        const catKey = (p.types || []).map(t => cfg.google_type_to_category[t]).find(Boolean) || 'other';
        const cat = cfg.categories.find(c2 => c2.key === catKey) || cfg.categories[cfg.categories.length - 1];
        spots.push({
          id: `gp-${p.id}`,
          lat, lng,
          name: p.displayName?.text || cat.label,
          category: cat.label,
          emoji: cat.emoji,
          address: p.shortFormattedAddress || null,
          source: 'google',
          unrated: true,
        });
      }
    }
    return anyOk && spots.length ? spots : null;
  }

  async function searchArea() {
    if (map.getZoom() < cfg.overpass_min_zoom) {
      toast('Zoom in a bit more, then search 🔍');
      return;
    }
    const c = map.getCenter();
    const corner = map.getBounds().getNorthEast();
    const radius = Math.min(cfg.overpass_max_radius_m, Math.round(c.distanceTo(corner)));

    status('Finding places nearby…');
    $('search-area-btn').classList.add('hidden');

    // Google Places first (fast, great coverage); Overpass if it can't help.
    let googleSpots = null;
    try { googleSpots = await searchGooglePlaces(c, radius); } catch { /* fall through */ }
    if (googleSpots) {
      status(null);
      let added = 0;
      for (const s of googleSpots) {
        if (!osmSpots.has(s.id)) added++;
        osmSpots.set(s.id, s);
      }
      renderMarkers();
      toast(added ? `Found ${added} new spot${added === 1 ? '' : 's'} — grey dots are unrated.`
                  : 'No new spots here. Try the ➕ button to add one.');
      return;
    }

    // nw (not nwr): skip relations — rarely useful for these POIs, much
    // faster. "qt" = quadtile output order, far cheaper than the default
    // id sort on large result sets.
    const around = `(around:${radius},${c.lat.toFixed(6)},${c.lng.toFixed(6)})`;
    const body = `[out:json][timeout:15];(${OVERPASS_SELECTORS.map(s => `nw${s}${around};`).join('')});out center tags qt 150;`;

    // Race all endpoints; first OK response wins.
    const attempt = endpoint => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 20000);
      return fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(body),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: abort.signal,
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }).finally(() => clearTimeout(timer));
    };
    let data = null;
    try {
      data = await Promise.any(cfg.overpass_endpoints.map(attempt));
    } catch { /* all endpoints failed */ }
    status(null);
    if (!data) { toast('Place search is busy right now — try again in a minute.'); return; }

    let added = 0;
    for (const el of data.elements || []) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      const tags = el.tags || {};
      const cat = categorize(tags);
      const id = `osm-${el.type}-${el.id}`;
      if (!osmSpots.has(id)) added++;
      osmSpots.set(id, {
        id, lat, lng,
        name: tags.name || tags.brand || cat.label,
        category: cat.label,
        emoji: cat.emoji,
        address: addressFrom(tags),
        source: 'osm',
        unrated: true,
      });
    }
    renderMarkers();
    toast(added ? `Found ${added} new spot${added === 1 ? '' : 's'} — grey dots are unrated.`
                : 'No new spots here. Try the ➕ button to add one.');
  }

  $('search-area-btn').addEventListener('click', searchArea);

  // ── Place / town search box ──────────────────────────────────────────────
  const AREA_TYPES = ['locality', 'sublocality', 'neighborhood', 'postal_code', 'country',
    'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3'];

  // Google Text Search → [{id,name,emoji,category,address,lat,lng,isArea}] | null
  async function textSearchGoogle(query) {
    const key = cfg.google_places_api_key;
    if (!key) return null;
    const c = map.getCenter();
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 8,
        locationBias: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 50000 } },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.places || []).map(p => {
      const lat = p.location?.latitude, lng = p.location?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;
      const isArea = (p.types || []).some(t => AREA_TYPES.includes(t));
      const catKey = (p.types || []).map(t => cfg.google_type_to_category[t]).find(Boolean) || 'other';
      const cat = cfg.categories.find(c2 => c2.key === catKey) || cfg.categories[cfg.categories.length - 1];
      return {
        id: `gp-${p.id}`, lat, lng, isArea,
        name: p.displayName?.text || cat.label,
        category: isArea ? 'Area' : cat.label,
        emoji: isArea ? '🏙️' : cat.emoji,
        address: p.formattedAddress || null,
        source: 'google',
      };
    }).filter(Boolean);
  }

  // Nominatim (OSM geocoder) fallback — same shape, ids match Overpass's.
  async function textSearchNominatim(query) {
    const c = map.getCenter();
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=8'
      + `&q=${encodeURIComponent(query)}&viewbox=${c.lng - 0.5},${c.lat + 0.5},${c.lng + 0.5},${c.lat - 0.5}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map(r => {
      const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      const isArea = r.class === 'place' || r.class === 'boundary';
      const cat = categorize({ [r.class]: r.type });
      const parts = (r.display_name || '').split(', ');
      return {
        id: `osm-${r.osm_type}-${r.osm_id}`, lat, lng, isArea,
        name: parts[0] || cat.label,
        category: isArea ? 'Area' : cat.label,
        emoji: isArea ? '🏙️' : cat.emoji,
        address: parts.slice(1, 4).join(', ') || null,
        source: 'osm',
      };
    }).filter(Boolean);
  }

  function hideSearchResults() { $('search-results').classList.add('hidden'); }

  function distanceLabel(r) {
    const meters = map.getCenter().distanceTo([r.lat, r.lng]);
    const mi = meters / 1609.34;
    if (mi < 0.1) return 'right here';
    return (mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()) + ' mi';
  }

  function showSearchResults(results) {
    const el = $('search-results');
    el.innerHTML = results.map((r, i) => `
      <div class="search-result" data-i="${i}">
        <span class="sr-emoji">${esc(r.emoji)}</span>
        <div style="min-width:0">
          <div class="sr-name">${esc(r.name)}</div>
          <div class="sr-addr">${esc(distanceLabel(r))} · ${esc(r.category)}${r.address ? ' · ' + esc(r.address) : ''}</div>
        </div>
      </div>`).join('');
    el.classList.remove('hidden');
    el.querySelectorAll('.search-result').forEach(row => {
      row.addEventListener('click', () => pickSearchResult(results[Number(row.dataset.i)]));
    });
  }

  function pickSearchResult(r) {
    hideSearchResults();
    $('place-search').blur();
    if (r.isArea) {
      // Fly to the area, then find what's around it.
      map.setView([r.lat, r.lng], Math.max(map.getZoom(), 14));
      setTimeout(searchArea, 700);
      return;
    }
    const spot = { ...r, unrated: true };
    delete spot.isArea;
    if (!ratedPlaces.has(spot.id)) osmSpots.set(spot.id, spot);
    renderMarkers();
    map.setView([r.lat, r.lng], Math.max(map.getZoom(), 17));
    openSheet(ratedPlaces.get(spot.id) || spot);
  }

  async function runPlaceSearch() {
    const q = $('place-search').value.trim();
    if (q.length < 2) return;
    hideSearchResults();
    status('Searching…');
    let results = null;
    try { results = await textSearchGoogle(q); } catch (e) { console.warn('[CanITwo] text search:', e.message); }
    if (!results || !results.length) {
      try { results = await textSearchNominatim(q); } catch (e) { console.warn('[CanITwo] nominatim:', e.message); }
    }
    status(null);
    if (!results || !results.length) { toast('Nothing found — try a different search.'); return; }
    showSearchResults(results);
  }

  // Form submit catches both the 🔍 button and every flavor of mobile
  // keyboard "search"/"go"/Enter key.
  $('search-form').addEventListener('submit', e => {
    e.preventDefault();
    runPlaceSearch();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-row')) hideSearchResults();
  });

  // ── Geolocation ──────────────────────────────────────────────────────────
  function locate(firstLoad) {
    if (!navigator.geolocation) { toast('Location not available on this device.'); return; }
    status('Locating you…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        status(null);
        const ll = [pos.coords.latitude, pos.coords.longitude];
        if (meMarker) meMarker.setLatLng(ll);
        else {
          meMarker = L.marker(ll, {
            icon: L.divIcon({ className: '', html: '<div class="pin-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            interactive: false, zIndexOffset: 500,
          }).addTo(map);
        }
        map.setView(ll, Math.max(map.getZoom(), 15));
        if (firstLoad) searchArea();
      },
      () => {
        status(null);
        if (!firstLoad) toast('Could not get your location — check permissions.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }
  $('locate-btn').addEventListener('click', () => locate(false));

  // ── Bottom sheet ─────────────────────────────────────────────────────────
  function starsHtml(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function directionsHtml(p) {
    const dest = `${p.lat},${p.lng}`;
    return `
      <div class="directions-row">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener">🗺️ Google</a>
        <a href="https://maps.apple.com/?daddr=${dest}" target="_blank" rel="noopener">🍎 Apple</a>
        <a href="https://waze.com/ul?ll=${dest}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a>
      </div>`;
  }

  function bathroomBadge(p) {
    const yes = p.yesCount || 0, no = p.noCount || 0;
    if (yes === 0 && no === 0) return '<span class="badge badge-unknown">🤷 No reports yet</span>';
    if (no > yes) return `<span class="badge badge-no">🚫 No bathroom (${no})</span>`;
    return `<span class="badge badge-yes">🚽 Has bathroom (${yes})</span>`;
  }

  function fmtDate(ts) {
    const secs = ts?.seconds;
    if (!secs) return '';
    return new Date(secs * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function reviewDate(r) { return fmtDate(r.updatedAt); }

  function historyHtml(r) {
    if (!r.history?.length) return '';
    const entries = [...r.history].reverse().map(h => `
      <div class="hist-entry">
        <div class="hist-head">
          <span>${h.hasBathroom
            ? (typeof h.rating === 'number' ? `<span class="review-stars">${starsHtml(h.rating)}</span>` : '🚽 had bathroom')
            : '<span class="review-nobathroom">🚫 no bathroom</span>'}</span>
          <span class="review-meta">${esc(fmtDate(h.at))}</span>
        </div>
        ${h.text ? `<p class="hist-text">${esc(h.text)}</p>` : '<p class="hist-text hist-empty">(no comment)</p>'}
      </div>`).join('');
    return `
      <details class="edit-history">
        <summary>Edit history (${r.history.length} earlier version${r.history.length === 1 ? '' : 's'})</summary>
        ${entries}
      </details>`;
  }

  async function openSheet(place) {
    currentPlace = place;
    const body = $('sheet-body');
    const rated = !place.unrated;

    body.innerHTML = `
      <div class="sheet-title-row">
        <div>
          <h2 class="sheet-title">${esc(place.emoji || '📍')} ${esc(place.name)}</h2>
          <p class="sheet-category">${esc(place.category || 'Place')}${place.address ? ' · ' + esc(place.address) : ''}</p>
        </div>
        ${bathroomBadge(place)}
      </div>
      ${typeof place.avgRating === 'number' ? `
        <div class="rating-summary">
          <span class="rating-big">${place.avgRating.toFixed(1)}</span>
          <span class="stars">${starsHtml(place.avgRating)}</span>
          <span class="rating-count">${place.ratingCount} rating${place.ratingCount === 1 ? '' : 's'}</span>
        </div>` : ''}
      <div class="sheet-actions">
        <button class="btn btn-primary" id="sheet-report-btn">✍️ ${rated ? 'Add your report' : 'Be the first to report'}</button>
        <button class="btn btn-secondary" id="sheet-share-btn" title="Share this place">↗️</button>
      </div>
      ${directionsHtml(place)}
      <div id="sheet-reviews"><p class="empty-note">Loading reviews…</p></div>
    `;
    $('sheet').classList.remove('hidden');
    $('sheet-report-btn').addEventListener('click', () => requireUser(() => openReportModal(place)));
    $('sheet-share-btn').addEventListener('click', () => sharePlace(place));

    // Load reviews (rated places only — unrated OSM spots have none yet).
    const reviewsEl = $('sheet-reviews');
    if (!rated && !ratedPlaces.has(place.id)) {
      reviewsEl.innerHTML = `<p class="empty-note">Nobody has reported on this spot yet. Traveling through? Be the hero the next traveler needs. 🦸</p>`;
      return;
    }
    try {
      const reviews = await Store.getReviews(place.id);
      if (currentPlace?.id !== place.id) return; // sheet changed while loading
      if (!reviews.length) {
        reviewsEl.innerHTML = `<p class="empty-note">No written reviews yet.</p>`;
        return;
      }
      const myUid = user?.uid;
      const mine = myUid && reviews.some(r => r.uid === myUid);
      if (mine) $('sheet-report-btn').innerHTML = '✏️ Edit your report';
      reviewsEl.innerHTML = `
        <div class="reviews-title">Reports (${reviews.length})</div>
        ${reviews.map(r => `
          <div class="review">
            <div class="review-head">
              <span class="review-user">${esc(r.username || 'anonymous')}${r.uid === myUid ? '<span class="you-tag">YOU</span>' : ''}</span>
              <span class="review-meta">${reviewDate(r)}${r.history?.length ? ' · <span class="edited-tag">edited</span>' : ''}${r.uid === myUid ? ' · <button class="review-edit-link" data-edit-review>edit</button>' : ''}</span>
            </div>
            <div>${r.hasBathroom
              ? (typeof r.rating === 'number' ? `<span class="review-stars">${starsHtml(r.rating)}</span>` : '<span class="badge badge-yes">🚽 Has bathroom</span>')
              : '<span class="review-nobathroom">🚫 Reported no bathroom</span>'}</div>
            ${r.text ? `<p class="review-text">${esc(r.text)}</p>` : ''}
            ${historyHtml(r)}
          </div>`).join('')}
      `;
      reviewsEl.querySelector('[data-edit-review]')
        ?.addEventListener('click', () => requireUser(() => openReportModal(place)));
    } catch (e) {
      console.warn('[CanITwo] reviews failed:', e);
      reviewsEl.innerHTML = `<p class="empty-note">Couldn't load reviews.</p>`;
    }
  }

  // ── Share links ──────────────────────────────────────────────────────────
  function sharePlace(p) {
    const params = new URLSearchParams({ place: p.id, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) });
    if (p.unrated) {
      params.set('name', p.name);
      params.set('cat', p.category || 'Place');
      params.set('emoji', p.emoji || '📍');
    }
    const url = `${location.origin}${location.pathname}?${params}`;
    if (navigator.share) {
      navigator.share({ title: `${p.name} — CanITwo`, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast('Link copied! 📋'), () => toast(url));
    } else {
      toast(url);
    }
  }

  // Open a ?place=… deep link. Rated places resolve from Firestore; unrated
  // spots reconstruct from the coords/name baked into the share URL.
  async function openDeepLink() {
    const q = new URLSearchParams(location.search);
    const id = q.get('place');
    if (!id) return false;
    let place = null;
    try { place = await Store.getPlace(id); } catch { /* offline etc. */ }
    if (place) {
      ratedPlaces.set(place.id, place);
    } else if (q.get('lat') && q.get('lng')) {
      place = {
        id,
        lat: Number(q.get('lat')),
        lng: Number(q.get('lng')),
        name: q.get('name') || 'Shared place',
        category: q.get('cat') || 'Place',
        emoji: q.get('emoji') || '📍',
        source: 'shared',
        unrated: true,
      };
      if (!isFinite(place.lat) || !isFinite(place.lng)) return false;
      osmSpots.set(place.id, place);
    } else {
      return false;
    }
    renderMarkers();
    map.setView([place.lat, place.lng], 17);
    openSheet(place);
    return true;
  }

  // ── Nearby list view ─────────────────────────────────────────────────────
  function openListSheet() {
    const c = map.getCenter();
    const spots = [];
    for (const p of ratedPlaces.values()) if (passesFilter(p)) spots.push(p);
    if (filters.showUnrated && filters.minRating <= 0) {
      for (const s of osmSpots.values()) if (!ratedPlaces.has(s.id)) spots.push(s);
    }
    const top = spots
      .map(s => ({ s, d: c.distanceTo([s.lat, s.lng]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 50)
      .map(x => x.s);

    const body = $('sheet-body');
    if (!top.length) {
      body.innerHTML = '<p class="empty-note">Nothing loaded yet — hit “🔍 Search this area” first, then open the list.</p>';
    } else {
      body.innerHTML = `
        <div class="reviews-title">Nearby (${top.length})</div>
        ${top.map((s, i) => `
          <div class="list-row" data-i="${i}">
            <span class="sr-emoji">${esc(s.emoji || '📍')}</span>
            <div style="min-width:0;flex:1">
              <div class="sr-name">${esc(s.name)}</div>
              <div class="sr-addr">${esc(distanceLabel(s))} · ${
                typeof s.avgRating === 'number' ? `★ ${s.avgRating.toFixed(1)}`
                : ((s.noCount || 0) > (s.yesCount || 0) ? '🚫 no bathroom' : 'unrated')
              }${s.address ? ' · ' + esc(s.address) : ''}</div>
            </div>
            <span class="list-chevron">›</span>
          </div>`).join('')}
      `;
      body.querySelectorAll('.list-row').forEach(row => {
        row.addEventListener('click', () => openSheet(top[Number(row.dataset.i)]));
      });
    }
    $('sheet').classList.remove('hidden');
    currentPlace = null;
  }

  $('chip-list').addEventListener('click', openListSheet);

  function closeSheet() {
    $('sheet').classList.add('hidden');
    currentPlace = null;
  }
  $('sheet-handle').addEventListener('click', closeSheet);
  map.on('click', closeSheet);

  // ── Report modal ─────────────────────────────────────────────────────────
  function openReportModal(place) {
    reportDraft = { place, hasBathroom: null, rating: 0 };
    $('report-place-name').textContent = `${place.emoji || '📍'} ${place.name}`;
    $('report-text').value = '';
    $('report-error').classList.add('hidden');
    setYN(null);
    setStars(0);

    // Prefill if the user already reviewed this place.
    Store.getMyReview(place.id).then(r => {
      if (!r || reportDraft?.place.id !== place.id) return;
      setYN(r.hasBathroom);
      setStars(r.rating || 0);
      $('report-text').value = r.text || '';
      $('report-title').textContent = 'Edit your report';
      $('report-submit').textContent = 'Update report';
    });
    $('report-title').textContent = 'Bathroom report';
    $('report-submit').textContent = 'Post report';
    $('report-modal').classList.remove('hidden');
  }

  function setYN(val) {
    reportDraft.hasBathroom = val;
    $('yn-yes').classList.toggle('selected-yes', val === true);
    $('yn-no').classList.toggle('selected-no', val === false);
    $('rating-field').classList.toggle('hidden', val !== true);
  }
  $('yn-yes').addEventListener('click', () => setYN(true));
  $('yn-no').addEventListener('click', () => setYN(false));

  function setStars(n) {
    reportDraft.rating = n;
    document.querySelectorAll('#star-input button').forEach(b => {
      b.classList.toggle('lit', Number(b.dataset.star) <= n);
    });
  }
  document.querySelectorAll('#star-input button').forEach(b => {
    b.addEventListener('click', () => setStars(Number(b.dataset.star)));
  });

  $('report-submit').addEventListener('click', async () => {
    const err = $('report-error');
    err.classList.add('hidden');
    if (reportDraft.hasBathroom === null) return showErr(err, 'Tell us: bathroom or no bathroom?');
    if (reportDraft.hasBathroom && !reportDraft.rating) return showErr(err, 'Give it a star rating (1–5).');

    const btn = $('report-submit');
    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Posting…';
    try {
      const agg = await Store.submitReport(reportDraft.place, {
        hasBathroom: reportDraft.hasBathroom,
        rating: reportDraft.rating,
        text: $('report-text').value,
      });
      const updated = { ...reportDraft.place, ...agg, unrated: false, updatedAt: null };
      ratedPlaces.set(updated.id, updated);
      osmSpots.delete(updated.id);
      renderMarkers();
      $('report-modal').classList.add('hidden');
      toast('Report posted — thanks for helping travelers in need! 🙏');
      openSheet(updated);
    } catch (e) {
      showErr(err, e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  });

  // ── Add custom place ─────────────────────────────────────────────────────
  const catSelect = $('add-place-category');
  cfg.categories.filter(c => c.key !== 'toilets').forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = `${c.emoji} ${c.label}`;
    catSelect.appendChild(opt);
  });

  function openAddPlace(latlng) {
    addPlaceLatLng = latlng;
    $('add-place-coords').textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    $('add-place-name').value = '';
    $('add-place-error').classList.add('hidden');
    $('add-place-modal').classList.remove('hidden');
  }

  $('add-place-btn').addEventListener('click', () => requireUser(() => openAddPlace(map.getCenter())));
  map.on('contextmenu', e => requireUser(() => openAddPlace(e.latlng)));

  $('add-place-submit').addEventListener('click', () => {
    const err = $('add-place-error');
    err.classList.add('hidden');
    const name = $('add-place-name').value.trim();
    if (name.length < 2) return showErr(err, 'Give the place a name.');
    const cat = cfg.categories.find(c => c.key === catSelect.value) || cfg.categories[cfg.categories.length - 1];
    const place = {
      id: Store.newCustomPlaceId(),
      name,
      category: cat.label,
      emoji: cat.emoji,
      lat: addPlaceLatLng.lat,
      lng: addPlaceLatLng.lng,
      address: null,
      source: 'custom',
      unrated: true,
    };
    $('add-place-modal').classList.add('hidden');
    openReportModal(place);
  });

  // ── Filters ──────────────────────────────────────────────────────────────
  document.querySelectorAll('#filter-chips .chip[data-min-rating]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filter-chips .chip[data-min-rating]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filters.minRating = Number(chip.dataset.minRating);
      renderMarkers();
      if (filters.minRating > 0 && filters.showUnrated) {
        toast('Star filters hide unrated spots.');
      }
    });
  });

  $('chip-unrated').addEventListener('click', () => {
    filters.showUnrated = !filters.showUnrated;
    $('chip-unrated').classList.toggle('active', filters.showUnrated);
    renderMarkers();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  function requireUser(fn) {
    if (user && profile?.username) { fn(); return; }
    pendingAfterAuth = fn;
    if (!user) $('auth-modal').classList.remove('hidden');
    else $('username-modal').classList.remove('hidden');
  }

  function runPendingAfterAuth() {
    if (user && profile?.username && pendingAfterAuth) {
      const fn = pendingAfterAuth;
      pendingAfterAuth = null;
      fn();
    }
  }

  Store.onAuth(async u => {
    user = u;
    profile = null;
    if (u) {
      $('auth-modal').classList.add('hidden');
      try { profile = await Store.getMyProfile(); } catch { /* offline etc. */ }
      if (!profile?.username) {
        $('username-modal').classList.remove('hidden');
      } else {
        runPendingAfterAuth();
      }
    }
    $('account-btn').textContent = u ? (profile?.username || 'Account') : 'Sign in';
  });

  $('account-btn').addEventListener('click', async () => {
    if (!user) { $('auth-modal').classList.remove('hidden'); return; }
    if (confirm(`Signed in as ${profile?.username || user.email}.\n\nSign out?`)) {
      await Store.signOut();
      toast('Signed out.');
    }
  });

  $('google-btn').addEventListener('click', async () => {
    const err = $('auth-error');
    err.classList.add('hidden');
    try { await Store.signInGoogle(); } catch (e) { showErr(err, friendlyAuthError(e)); }
  });

  $('email-signin-btn').addEventListener('click', () => emailAuth('in'));
  $('email-signup-btn').addEventListener('click', () => emailAuth('up'));

  async function emailAuth(mode) {
    const err = $('auth-error');
    err.classList.add('hidden');
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    if (!email || !password) return showErr(err, 'Enter your email and password.');
    try {
      if (mode === 'up') await Store.signUpEmail(email, password);
      else await Store.signInEmail(email, password);
    } catch (e) {
      showErr(err, friendlyAuthError(e));
    }
  }

  $('forgot-btn').addEventListener('click', async () => {
    const err = $('auth-error');
    err.classList.add('hidden');
    const email = $('auth-email').value.trim();
    if (!email) return showErr(err, 'Enter your email above first.');
    try {
      await Store.resetPassword(email);
      toast('Password reset email sent.');
    } catch (e) {
      showErr(err, friendlyAuthError(e));
    }
  });

  function friendlyAuthError(e) {
    const m = {
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/user-not-found': 'No account with that email — try "Create account".',
      'auth/email-already-in-use': 'That email already has an account — try "Sign in".',
      'auth/weak-password': 'Password needs at least 6 characters.',
      'auth/invalid-email': 'That email doesn\'t look right.',
    };
    return m[e.code] || e.message || 'Sign-in failed. Try again.';
  }

  $('username-submit').addEventListener('click', async () => {
    const err = $('username-error');
    err.classList.add('hidden');
    const btn = $('username-submit');
    btn.disabled = true;
    try {
      const username = await Store.claimUsername($('username-input').value.trim());
      profile = { username };
      $('username-modal').classList.add('hidden');
      $('account-btn').textContent = username;
      toast(`Welcome, ${username}! 🚽`);
      runPendingAfterAuth();
    } catch (e) {
      showErr(err, e.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ── Small UI helpers ─────────────────────────────────────────────────────
  document.querySelectorAll('.modal-close').forEach(b => {
    b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden'));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      // Username modal is intentionally not dismissible by tapping outside.
      if (e.target === overlay && overlay.id !== 'username-modal') overlay.classList.add('hidden');
    });
  });

  function showErr(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  function status(msg) {
    const s = $('status-pill');
    if (!msg) { s.classList.add('hidden'); return; }
    s.textContent = msg;
    s.classList.remove('hidden');
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  loadRatedPlaces();
  openDeepLink().then(opened => { if (!opened) locate(true); });
})();
