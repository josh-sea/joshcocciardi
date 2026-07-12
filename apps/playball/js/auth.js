'use strict';

const SpotifyAuth = (() => {
  const KEYS = {
    token:    'sp_access_token',
    refresh:  'sp_refresh_token',
    expires:  'sp_expires_at',
    verifier: 'sp_code_verifier',
    user:     'sp_user',
    scopes:   'sp_scopes',
  };

  const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
  ].join(' ');

  function clientId() { return window.APP_CONFIG?.spotify_client_id || ''; }

  function redirectUri() {
    const { origin, pathname } = window.location;
    const base = pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
    return origin + base;
  }

  function rand(len) {
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(buf, b => chars[b % chars.length]).join('');
  }

  async function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  }

  function b64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async function login(forceDialog = false) {
    const verifier  = rand(64);
    const challenge = b64url(await sha256(verifier));
    // Both storages: sessionStorage can be lost when the OAuth round trip
    // lands in a different browsing context (installed PWA ↔ in-app browser).
    sessionStorage.setItem(KEYS.verifier, verifier);
    try { localStorage.setItem(KEYS.verifier, verifier); } catch (_) {}
    const params = {
      client_id: clientId(), response_type: 'code',
      redirect_uri: redirectUri(), scope: SCOPES,
      code_challenge_method: 'S256', code_challenge: challenge,
    };
    if (forceDialog) params.show_dialog = 'true';
    window.location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams(params);
  }

  async function handleCallback(code) {
    const verifier = sessionStorage.getItem(KEYS.verifier) || localStorage.getItem(KEYS.verifier);
    if (!verifier) throw new Error('No PKCE verifier — try logging in again.');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId(), grant_type: 'authorization_code',
        code, redirect_uri: redirectUri(), code_verifier: verifier,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error_description || 'Token exchange failed');
    }
    const data = await res.json();
    _storeTokens(data);
    sessionStorage.removeItem(KEYS.verifier);
    localStorage.removeItem(KEYS.verifier);
  }

  // Error with the HTTP status attached, so callers can tell "needs a fresh
  // login" (401 / missing scope) apart from "Spotify refuses this account".
  function _apiErr(message, status) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  async function _refresh() {
    const rt = localStorage.getItem(KEYS.refresh);
    if (!rt) throw _apiErr('Not connected to Spotify — please log in.', 401);
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), grant_type: 'refresh_token', refresh_token: rt }),
    });
    if (!res.ok) throw _apiErr('Spotify session expired — please reconnect.', 401);
    const data = await res.json();
    _storeTokens(data);
    return data.access_token;
  }

  function _storeTokens(data) {
    localStorage.setItem(KEYS.token,   data.access_token);
    if (data.refresh_token) localStorage.setItem(KEYS.refresh, data.refresh_token);
    localStorage.setItem(KEYS.expires, String(Date.now() + (data.expires_in - 60) * 1000));
    if (data.scope) localStorage.setItem(KEYS.scopes, data.scope);
  }

  function hasScope(scope) {
    return (localStorage.getItem(KEYS.scopes) || '').split(' ').includes(scope);
  }

  // Which of `required` were NOT granted on the current token. Returns []
  // when nothing is known to be missing (including when Spotify never told
  // us the granted scopes — don't guess "missing" and trigger a reauth loop).
  function missingScopes(required) {
    const granted = (localStorage.getItem(KEYS.scopes) || '').split(' ').filter(Boolean);
    if (!granted.length) return [];
    return required.filter(s => !granted.includes(s));
  }

  async function getToken() {
    const exp = parseInt(localStorage.getItem(KEYS.expires) || '0');
    if (Date.now() > exp) return _refresh();
    return localStorage.getItem(KEYS.token);
  }

  function isLoggedIn() { return !!localStorage.getItem(KEYS.token); }

  function logout() {
    Object.values(KEYS).forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
  }

  async function getUser() {
    const cached = localStorage.getItem(KEYS.user);
    if (cached) return JSON.parse(cached);
    const u = await apiCall('/me');
    localStorage.setItem(KEYS.user, JSON.stringify(u));
    return u;
  }

  function _fetchApi(path, opts, token) {
    return fetch('https://api.spotify.com/v1' + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  }

  async function apiCall(path, opts = {}) {
    let res = await _fetchApi(path, opts, await getToken());
    if (res.status === 401) {
      // Token rejected even though it looked fresh (revoked, clock skew…):
      // force one refresh and retry before giving up.
      const token = await _refresh();
      res = await _fetchApi(path, opts, token);
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      let msg = '';
      try {
        const text = await res.text();
        try { msg = JSON.parse(text).error?.message || ''; } catch (_) { msg = text; }
      } catch (_) {}
      msg = (msg || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      throw _apiErr((msg || 'Spotify API error') + ' (HTTP ' + res.status + ')', res.status);
    }
    return res.json();
  }

  async function search(q) {
    const d = await apiCall('/search?q=' + encodeURIComponent(q) + '&type=track&limit=10');
    return d.tracks.items;
  }

  async function startPlayback(deviceId, trackId, positionMs) {
    const token = await getToken();
    const res = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + deviceId, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: ['spotify:track:' + trackId], position_ms: positionMs }),
    });
    if (!res.ok && res.status !== 204) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || 'Playback failed (' + res.status + ')');
    }
  }

  // All of the user's playlists (paginated, capped at 500)
  async function getUserPlaylists() {
    const items = [];
    let url = '/me/playlists?limit=50';
    while (url && items.length < 500) {
      const data = await apiCall(url);
      items.push(...(data.items || []));
      url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
    }
    return items;
  }

  // All track objects for a playlist (paginated, filters out local/unavailable files)
  async function getPlaylistTracks(playlistId) {
    const items = [];
    let url = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
    while (url && items.length < 1000) {
      const data = await apiCall(url);
      items.push(...(data.items || []));
      url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
    }
    return items.map(i => i.track).filter(t => t?.id);
  }

  // Replace a Spotify playlist's contents with the given track URIs (in order).
  // PUT replaces with the first 100; any remainder is appended in chunks of 100.
  async function replacePlaylistTracks(playlistId, trackUris) {
    const base = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
    await apiCall(base, { method: 'PUT', body: JSON.stringify({ uris: trackUris.slice(0, 100) }) });
    for (let i = 100; i < trackUris.length; i += 100) {
      await apiCall(base, { method: 'POST', body: JSON.stringify({ uris: trackUris.slice(i, i + 100) }) });
    }
  }

  // Create a new (private) playlist on the user's account. Returns its id.
  async function createPlaylist(name, description = '') {
    const me = await getUser();
    const d  = await apiCall(`/users/${encodeURIComponent(me.id)}/playlists`, {
      method: 'POST',
      body: JSON.stringify({ name, description, public: false }),
    });
    return d.id;
  }

  return { login, handleCallback, getToken, isLoggedIn, logout, getUser,
           search, startPlayback, getUserPlaylists, getPlaylistTracks, apiCall, hasScope,
           missingScopes, replacePlaylistTracks, createPlaylist };
})();
