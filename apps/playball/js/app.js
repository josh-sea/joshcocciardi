'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  user:        null,   // Spotify user
  fbUser:      null,   // Firebase user (playlist storage)
  store:       null,   // window.Store once Firebase is ready
  playlists:   [],     // { docId, spotifyId, name, tracks, created, updated }
  activeIdx:   -1,
  searchTimer: null,
  mobileTab:   'editor',
  installEvt:  null,
  // Player
  sdkPlayer:   null,
  deviceId:    null,
  nowIdx:      -1,
  playing:     false,
  stopTimer:   null,
  progTimer:   null,
  segStart:    0,
  segEnd:      0,
};

const isMobile = () => window.innerWidth <= 640;

// ── DOM helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function msToTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function timeToMs(str) {
  const parts = (str || '0:00').split(':');
  return ((parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)) * 1000;
}

let _toastTimer;
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Firebase account ───────────────────────────────────────────────────────
async function initStore() {
  const timeout = new Promise(r => setTimeout(() => r(null), 8000));
  S.store = await Promise.race([window.StoreReady, timeout]);
  if (!S.store) {
    console.warn('Firebase failed to load — playlist saving disabled.');
    renderAccountUI();
    return;
  }
  S.store.onAuth(user => {
    S.fbUser = user;
    if (user) {
      loadSavedPlaylists();
    } else {
      // Keep only unsaved local playlists after sign-out
      S.playlists = S.playlists.filter(p => !p.docId);
      if (S.activeIdx >= S.playlists.length) S.activeIdx = -1;
      renderSidebar(); renderEditor();
    }
    renderAccountUI();
  });
}

function _fbErr(e) {
  const m = { 'auth/invalid-credential': 'Wrong email or password.',
              'auth/invalid-email': 'That email address looks invalid.',
              'auth/email-already-in-use': 'An account with that email already exists — sign in instead.',
              'auth/weak-password': 'Password must be at least 6 characters.',
              'auth/too-many-requests': 'Too many attempts — try again in a bit.' };
  return m[e.code] || e.message || 'Something went wrong.';
}

// Renders the Google / email sign-in form into a container.
function renderAuthForm(container) {
  if (!container) return;
  if (!S.store) {
    container.innerHTML = '<p class="hint" style="padding:14px">Account service unavailable — check your connection.</p>';
    return;
  }
  if (S.fbUser) {
    container.innerHTML = `
      <div class="fb-auth">
        <p class="fb-signed-in">Signed in as <strong>${esc(S.fbUser.email || S.fbUser.displayName || 'account')}</strong></p>
        <p class="fb-note">Your playlists and lineups are saved to your account.</p>
        <button class="btn btn-secondary fb-signout">Sign out</button>
      </div>`;
    container.querySelector('.fb-signout').addEventListener('click', async () => {
      await S.store.signOut();
      toast('Signed out.');
    });
    return;
  }
  container.innerHTML = `
    <div class="fb-auth">
      <button class="btn btn-google fb-google">
        <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
        Continue with Google
      </button>
      <div class="auth-divider">or use email</div>
      <input type="email" class="fb-email" placeholder="Email" autocomplete="email" />
      <input type="password" class="fb-pass" placeholder="Password" autocomplete="current-password" />
      <div class="fb-row">
        <button class="btn btn-primary fb-signin">Sign in</button>
        <button class="btn btn-secondary fb-signup">Create account</button>
      </div>
      <button class="fb-reset">Forgot password?</button>
      <p class="fb-msg hidden"></p>
    </div>`;

  const msg = (text, ok = false) => {
    const el = container.querySelector('.fb-msg');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.color = ok ? 'var(--green)' : 'var(--danger)';
  };
  const email = () => container.querySelector('.fb-email').value.trim();
  const pass  = () => container.querySelector('.fb-pass').value;

  container.querySelector('.fb-google').addEventListener('click', async () => {
    try { await S.store.signInGoogle(); } catch (e) { msg(_fbErr(e)); }
  });
  container.querySelector('.fb-signin').addEventListener('click', async () => {
    if (!email() || !pass()) return msg('Enter your email and password.');
    try { await S.store.signInEmail(email(), pass()); toast('Signed in!', 'success'); }
    catch (e) { msg(_fbErr(e)); }
  });
  container.querySelector('.fb-signup').addEventListener('click', async () => {
    if (!email() || !pass()) return msg('Enter an email and a password (6+ characters).');
    try { await S.store.signUpEmail(email(), pass()); toast('Account created!', 'success'); }
    catch (e) { msg(_fbErr(e)); }
  });
  container.querySelector('.fb-reset').addEventListener('click', async () => {
    if (!email()) return msg('Enter your email first, then tap "Forgot password?".');
    try { await S.store.resetPassword(email()); msg('Password reset email sent.', true); }
    catch (e) { msg(_fbErr(e)); }
  });
  container.querySelector('.fb-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') container.querySelector('.fb-signin').click();
  });
}

function renderAccountUI() {
  // Auth overlay + account modal forms
  renderAuthForm($('fb-auth-box'));
  renderAuthForm($('fb-auth-box-modal'));

  // Sidebar status line
  const el = $('account-status');
  if (!el) return;
  if (!S.store) {
    el.innerHTML = 'Account service unavailable — playlists won\'t be saved.';
    el.className = 'account-status err';
  } else if (S.fbUser) {
    el.innerHTML = `✓ ${esc(S.fbUser.email || 'Signed in')} · <button class="linklike" id="account-open-btn">account</button>`;
    el.className = 'account-status ok';
  } else {
    el.innerHTML = '<button class="linklike" id="account-open-btn">Sign in</button> to save playlists across devices.';
    el.className = 'account-status';
  }
  $('account-open-btn')?.addEventListener('click', openAccountModal);
}

function openAccountModal()  { renderAuthForm($('fb-auth-box-modal')); $('account-modal').classList.remove('hidden'); }
function closeAccountModal() { $('account-modal').classList.add('hidden'); }

// ── Mobile tab switching ───────────────────────────────────────────────────
function switchTab(tab) {
  S.mobileTab = tab;
  const map = { library: '.sidebar', editor: '.editor', playing: '.mobile-playing', lineup: '.lineup' };
  Object.entries(map).forEach(([t, sel]) =>
    document.querySelector(sel)?.classList.toggle('mob-active', t === tab)
  );
  document.querySelectorAll('.mnav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
  $('app').classList.toggle('show-lineup', tab === 'lineup');
  $('lineup-toggle-btn')?.classList.toggle('active', tab === 'lineup');
}

// ── Playlist helpers ───────────────────────────────────────────────────────
function currentPlaylist() { return S.playlists[S.activeIdx] || null; }

function trackFromSpotify(t) {
  return {
    id:          t.id,
    name:        t.name,
    artist:      (t.artists || []).map(a => a.name).join(', '),
    album:       t.album?.name || '',
    image:       t.album?.images?.[0]?.url || '',
    duration_ms: t.duration_ms || 0,
    start_ms:    0,
    end_ms:      t.duration_ms || 0,
  };
}

// ── Render: sidebar ────────────────────────────────────────────────────────
function renderSidebar() {
  const el = $('playlist-list');
  if (!S.playlists.length) {
    el.innerHTML = '<p class="hint">Click + to create a playlist,<br>or import one from Spotify.</p>';
    return;
  }
  el.innerHTML = S.playlists.map((pl, i) => `
    <div class="pl-item${i === S.activeIdx ? ' active' : ''}" data-i="${i}">
      <span class="pl-name">${esc(pl.name)}</span>
      ${pl.spotifyId ? '<span class="pl-linked" title="Linked to Spotify">♫</span>' : ''}
      <span class="pl-count">${pl.tracks.length}</span>
    </div>
  `).join('');
  el.querySelectorAll('.pl-item').forEach(el =>
    el.addEventListener('click', () => openPlaylist(+el.dataset.i))
  );
}

// ── Render: editor ─────────────────────────────────────────────────────────
function renderEditor() {
  const pl = currentPlaylist();
  if (!pl) {
    $('editor-empty').classList.remove('hidden');
    $('editor-content').classList.add('hidden');
    return;
  }
  $('editor-empty').classList.add('hidden');
  $('editor-content').classList.remove('hidden');
  $('playlist-name').value = pl.name;
  $('sync-btn').classList.toggle('hidden', !pl.tracks.length);
  $('sync-btn').textContent = pl.spotifyId ? 'Sync to Spotify' : 'Create on Spotify';

  const list = $('track-list');
  if (!pl.tracks.length) {
    list.innerHTML = '<p class="hint">Search for songs above, then click Add.</p>';
    return;
  }

  list.innerHTML = pl.tracks.map((t, i) => `
    <div class="track-item${i === S.nowIdx && S.playing ? ' playing' : ''}" id="ti-${i}">
      <span class="t-num">${i + 1}</span>
      <img class="t-art" src="${t.image}" alt="" loading="lazy" />
      <div class="t-info">
        <div class="t-name" title="${esc(t.name)}">${esc(t.name)}</div>
        <div class="t-artist">${esc(t.artist)}</div>
      </div>
      <div class="t-times">
        <div class="t-time-group">
          <span class="t-time-label">Start</span>
          <input class="t-time-input" type="text" value="${msToTime(t.start_ms)}"
                 data-i="${i}" data-f="start_ms" title="Max ${msToTime(t.duration_ms)}" />
        </div>
        <span class="t-sep">→</span>
        <div class="t-time-group">
          <span class="t-time-label">End</span>
          <input class="t-time-input" type="text" value="${msToTime(t.end_ms)}"
                 data-i="${i}" data-f="end_ms" title="Max ${msToTime(t.duration_ms)}" />
        </div>
        <span class="t-dur">${msToTime(t.duration_ms)}</span>
      </div>
      <div class="t-actions">
        <button class="t-play-btn${i === S.nowIdx && S.playing ? ' active' : ''}" data-i="${i}" title="Play segment">▶</button>
        <button class="t-move-btn" data-i="${i}" data-d="-1" title="Move up"   ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="t-move-btn" data-i="${i}" data-d="1"  title="Move down" ${i === pl.tracks.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="t-rm-btn"   data-i="${i}" title="Remove">×</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.t-time-input').forEach(inp => {
    inp.addEventListener('change', onTimeChange);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
  list.querySelectorAll('.t-play-btn').forEach(btn =>
    btn.addEventListener('click', () => playAt(+btn.dataset.i))
  );
  list.querySelectorAll('.t-move-btn').forEach(btn =>
    btn.addEventListener('click', () => moveTrack(+btn.dataset.i, +btn.dataset.d))
  );
  list.querySelectorAll('.t-rm-btn').forEach(btn =>
    btn.addEventListener('click', () => removeTrack(+btn.dataset.i))
  );
}

function onTimeChange(e) {
  const inp   = e.target;
  const i     = +inp.dataset.i;
  const field = inp.dataset.f;
  const pl    = currentPlaylist();
  if (!pl) return;
  const t  = pl.tracks[i];
  let ms   = timeToMs(inp.value);
  if (field === 'start_ms') ms = Math.max(0, Math.min(ms, t.end_ms - 1000));
  else                      ms = Math.max(t.start_ms + 1000, Math.min(ms, t.duration_ms));
  t[field]  = ms;
  inp.value = msToTime(ms);
}

function moveTrack(i, dir) {
  const pl = currentPlaylist();
  if (!pl) return;
  const j = i + dir;
  if (j < 0 || j >= pl.tracks.length) return;
  [pl.tracks[i], pl.tracks[j]] = [pl.tracks[j], pl.tracks[i]];
  if (S.nowIdx === i) S.nowIdx = j;
  else if (S.nowIdx === j) S.nowIdx = i;
  renderEditor();
  scheduleEditorSync();
}

// Reordering a Spotify-linked playlist auto-syncs the new order back to
// Spotify (debounced so a burst of moves becomes one API call).
let _editorSyncTimer;
function scheduleEditorSync() {
  const pl = currentPlaylist();
  if (!pl?.spotifyId || !pl.tracks.length) return;
  clearTimeout(_editorSyncTimer);
  _editorSyncTimer = setTimeout(async () => {
    try {
      await SpotifyAuth.replacePlaylistTracks(pl.spotifyId, pl.tracks.map(t => 'spotify:track:' + t.id));
      toast('Order synced to Spotify', 'success');
      if (S.fbUser && pl === currentPlaylist()) savePlaylist(true);
    } catch (e) {
      console.warn('auto-sync:', e);
      toast('Auto-sync failed: ' + e.message, 'error');
    }
  }, 1800);
}

function removeTrack(i) {
  const pl = currentPlaylist();
  if (!pl) return;
  pl.tracks.splice(i, 1);
  if (S.nowIdx >= i) S.nowIdx = Math.max(-1, S.nowIdx - 1);
  renderEditor();
  renderSidebar();
}

// ── Player ─────────────────────────────────────────────────────────────────
function _createPlayer() {
  if (S.sdkPlayer) { try { S.sdkPlayer.disconnect(); } catch {} }
  S.sdkPlayer = null;
  S.deviceId  = null;

  return new Promise((resolve, reject) => {
    const player = new Spotify.Player({
      name: 'Playball',
      getOAuthToken: async cb => cb(await SpotifyAuth.getToken()),
      volume: 0.8,
    });
    const t = setTimeout(() => reject(new Error('Player connect timed out')), 10000);
    player.addListener('ready', ({ device_id }) => {
      clearTimeout(t);
      S.sdkPlayer = player;
      S.deviceId  = device_id;
      resolve();
    });
    player.addListener('not_ready', () => {
      S.deviceId = null;
      setTimeout(() => S.sdkPlayer?.connect().catch(console.warn), 2000);
    });
    player.addListener('account_error', () =>
      toast('Spotify Premium required for playback.', 'error'));
    player.addListener('initialization_error', ({ message }) => { clearTimeout(t); reject(new Error(message)); });
    player.addListener('authentication_error', ({ message }) => { clearTimeout(t); reject(new Error(message)); });
    player.addListener('player_state_changed', st => {
      if (!st) return;
      S.playing = !st.paused;
      syncPPBtns();
    });
    player.connect().then(ok => { if (!ok) { clearTimeout(t); reject(new Error('SDK connect failed')); } });
  });
}

async function initSDK() {
  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () =>
      _createPlayer().then(resolve).catch(reject);
    const sc = document.createElement('script');
    sc.src = 'https://sdk.scdn.co/spotify-player.js';
    sc.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.head.appendChild(sc);
  });
}

// If the device is gone, try .connect() first (fast path), then full re-init.
async function ensureConnected() {
  if (S.deviceId) return;
  if (!S.sdkPlayer && !window.Spotify) throw new Error('Player not initialized — Spotify Premium required');

  toast('Reconnecting…', '');

  // Fast path: existing player might just need a nudge
  if (S.sdkPlayer) {
    S.sdkPlayer.connect().catch(console.warn);
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (S.deviceId) { toast('Player ready', 'success'); return; }
    }
  }

  // Slow path: tear down and recreate the player entirely
  try {
    await _createPlayer();
    toast('Player ready', 'success');
  } catch (e) {
    throw new Error('Could not reconnect to Spotify — check your connection');
  }
}

async function playAt(i) {
  const pl = currentPlaylist();
  if (!pl || i < 0 || i >= pl.tracks.length) return;
  try { await ensureConnected(); } catch (err) { toast(err.message, 'error'); return; }

  clearTimeout(S.stopTimer);
  clearInterval(S.progTimer);

  const track  = pl.tracks[i];
  S.nowIdx     = i;
  S.segStart   = track.start_ms;
  S.segEnd     = track.end_ms;
  const segDur = S.segEnd - S.segStart;

  try {
    await SpotifyAuth.startPlayback(S.deviceId, track.id, S.segStart);
  } catch (err) {
    // Device may have just dropped — reconnect once and retry
    if (err.message.toLowerCase().includes('device') || err.message.includes('404') || err.message.includes('502')) {
      S.deviceId = null;
      try {
        await ensureConnected();
        await SpotifyAuth.startPlayback(S.deviceId, track.id, S.segStart);
      } catch (err2) {
        toast(err2.message, 'error');
        return;
      }
    } else {
      toast(err.message, 'error');
      return;
    }
  }

  S.playing = true;
  syncPPBtns();
  syncPlayerUI(track);
  renderEditor();
  if (isMobile()) switchTab('playing');

  _startProgressTimer(S.segStart, segDur, pl);
}

function _startProgressTimer(fromMs, segDur, pl) {
  clearInterval(S.progTimer);
  clearTimeout(S.stopTimer);
  const wallStart  = Date.now();
  const remaining  = S.segEnd - fromMs;

  S.progTimer = setInterval(() => {
    const elapsed = Date.now() - wallStart;
    const ms      = fromMs + elapsed;
    const pct     = Math.min(100, ((ms - S.segStart) / segDur) * 100);
    const label   = msToTime(ms);
    $('pb-fill').style.width = pct + '%';
    $('mp-fill').style.width = pct + '%';
    $('pb-cur').textContent  = label;
    $('mp-cur').textContent  = label;
  }, 200);

  S.stopTimer = setTimeout(async () => {
    clearInterval(S.progTimer);
    if (S.nowIdx < (pl?.tracks.length ?? 0) - 1) {
      await playAt(S.nowIdx + 1);
    } else {
      await stopPlayback();
    }
  }, remaining);
}

// Seek to any ms position within the full track; restarts segment timer from there
async function seekTo(posMs) {
  clearTimeout(S.stopTimer);
  clearInterval(S.progTimer);
  if (!S.sdkPlayer) return;

  const pl    = currentPlaylist();
  const track = pl?.tracks[S.nowIdx];
  if (!track) return;

  await S.sdkPlayer.seek(posMs);

  const segDur = S.segEnd - S.segStart;

  // Resume progress timer from seeked position
  const wallStart = Date.now();
  S.progTimer = setInterval(() => {
    const elapsed = Date.now() - wallStart;
    const ms  = posMs + elapsed;
    const pct = Math.min(100, ((ms - S.segStart) / segDur) * 100);
    $('pb-fill').style.width = pct + '%';
    $('mp-fill').style.width = pct + '%';
    $('pb-cur').textContent  = msToTime(ms);
    $('mp-cur').textContent  = msToTime(ms);
  }, 200);

  const remaining = S.segEnd - posMs;
  if (remaining > 0) {
    S.stopTimer = setTimeout(async () => {
      clearInterval(S.progTimer);
      if (S.nowIdx < (pl?.tracks.length ?? 0) - 1) {
        await playAt(S.nowIdx + 1);
      } else {
        await stopPlayback();
      }
    }, remaining);
  } else {
    // Dragged past end — advance now
    if (S.nowIdx < (pl?.tracks.length ?? 0) - 1) playAt(S.nowIdx + 1);
    else stopPlayback();
  }
}

async function stopPlayback() {
  clearTimeout(S.stopTimer);
  clearInterval(S.progTimer);
  if (S.sdkPlayer) await S.sdkPlayer.pause();
  S.playing = false;
  S.nowIdx  = -1;
  syncPPBtns();
  $('pb-fill').style.width = '0%';
  $('mp-fill').style.width = '0%';
  renderEditor();
}

async function togglePlayback() {
  if (S.playing) {
    clearTimeout(S.stopTimer); clearInterval(S.progTimer);
    if (S.sdkPlayer) await S.sdkPlayer.pause();
    S.playing = false; syncPPBtns();
  } else if (S.nowIdx >= 0) {
    if (S.sdkPlayer) await S.sdkPlayer.resume();
    S.playing = true; syncPPBtns();
  } else if (currentPlaylist()?.tracks.length) {
    playAt(0);
  }
}

function syncPPBtns() {
  const icon = S.playing ? '⏸' : '▶';
  $('pp-btn').textContent = icon;
  $('mp-pp').textContent  = icon;
}

function syncPlayerUI(track) {
  $('pb-art').src             = track.image;
  $('pb-name').textContent    = track.name;
  $('pb-artist').textContent  = track.artist;
  $('pb-end').textContent     = msToTime(track.end_ms);
  $('pb-segment').textContent = msToTime(track.start_ms) + ' → ' + msToTime(track.end_ms);
  $('player-bar').classList.remove('hidden');

  const art = $('mp-art');
  art.src = track.image;
  art.classList.remove('pulse'); void art.offsetWidth; art.classList.add('pulse');
  $('mp-name').textContent   = track.name;
  $('mp-artist').textContent = track.artist;
  $('mp-pl').textContent     = currentPlaylist()?.name || '';
  $('mp-seg').textContent    = msToTime(track.start_ms) + ' → ' + msToTime(track.end_ms);
  $('mp-end').textContent    = msToTime(track.end_ms);
  $('mp-idle').classList.add('hidden');
  $('mp-track').classList.remove('hidden');
}

// ── Scrubbing ──────────────────────────────────────────────────────────────
function initScrubbing() {
  // Both desktop bar and mobile bar
  const bars = [
    $('pb-scrub'),  // desktop
    $('mp-scrub'),  // mobile now-playing
  ].filter(Boolean);

  let dragging  = false;
  let activeBar = null;

  function pctAt(bar, e) {
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const x = (touch ? touch.clientX : e.clientX) - bar.getBoundingClientRect().left;
    return Math.max(0, Math.min(1, x / bar.offsetWidth));
  }

  function pctToMs(pct) {
    // Map 0–1 within the segment (start_ms → end_ms)
    return Math.round(S.segStart + pct * (S.segEnd - S.segStart));
  }

  function updateVisuals(pct) {
    const ms = pctToMs(pct);
    const t  = msToTime(ms);
    $('pb-fill').style.width = (pct * 100) + '%';
    $('mp-fill').style.width = (pct * 100) + '%';
    $('pb-cur').textContent  = t;
    $('mp-cur').textContent  = t;
  }

  bars.forEach(bar => {
    bar.addEventListener('mousedown', e => {
      if (S.nowIdx < 0) return;
      dragging = true; activeBar = bar;
      clearInterval(S.progTimer); // pause ticker while dragging
      bar.classList.add('scrubbing');
      updateVisuals(pctAt(bar, e));
      e.preventDefault();
    });
    bar.addEventListener('touchstart', e => {
      if (S.nowIdx < 0) return;
      dragging = true; activeBar = bar;
      clearInterval(S.progTimer);
      bar.classList.add('scrubbing');
      updateVisuals(pctAt(bar, e));
    }, { passive: true });
  });

  document.addEventListener('mousemove', e => {
    if (!dragging || !activeBar) return;
    updateVisuals(pctAt(activeBar, e));
  });
  document.addEventListener('touchmove', e => {
    if (!dragging || !activeBar) return;
    updateVisuals(pctAt(activeBar, e));
  }, { passive: true });

  const onEnd = e => {
    if (!dragging || !activeBar) return;
    const pct = pctAt(activeBar, e);
    activeBar.classList.remove('scrubbing');
    dragging = false; activeBar = null;
    seekTo(pctToMs(pct));
  };
  document.addEventListener('mouseup',  onEnd);
  document.addEventListener('touchend', onEnd);
}

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(q) {
  if (!q.trim()) { $('search-results').classList.add('hidden'); return; }
  try {
    const tracks = await SpotifyAuth.search(q);
    renderSearchResults(tracks);
  } catch (e) { console.error('search:', e); }
}

function renderSearchResults(tracks) {
  const el = $('search-results');
  if (!tracks.length) {
    el.innerHTML = '<p class="hint" style="padding:14px">No results.</p>';
    el.classList.remove('hidden'); return;
  }
  el.innerHTML = tracks.map(t => {
    const img  = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '';
    const art  = (t.artists || []).map(a => a.name).join(', ');
    const data = JSON.stringify(trackFromSpotify(t)).replace(/"/g, '&quot;');
    return `
      <div class="sr-item">
        <img class="sr-img" src="${img}" alt="" loading="lazy" />
        <div class="sr-info">
          <div class="sr-name">${esc(t.name)}</div>
          <div class="sr-sub">${esc(art)} · ${esc(t.album?.name || '')}</div>
        </div>
        <span class="sr-dur">${msToTime(t.duration_ms)}</span>
        <button class="sr-add" data-track="${data}">Add</button>
      </div>`;
  }).join('');
  el.querySelectorAll('.sr-add').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addTrack(JSON.parse(btn.dataset.track.replace(/&quot;/g, '"')));
      btn.textContent = '✓'; btn.style.background = '#555';
      setTimeout(() => { btn.textContent = 'Add'; btn.style.background = ''; }, 1500);
    });
  });
  el.classList.remove('hidden');
}

function addTrack(track) {
  if (!currentPlaylist()) createPlaylist();
  currentPlaylist().tracks.push(track);
  renderEditor(); renderSidebar();
  if (isMobile()) switchTab('editor');
}

// ── Spotify playlist import ────────────────────────────────────────────────

// Classify a failed Spotify call:
//   'reauth'  — a fresh login can actually fix it (expired/revoked token,
//               or the token is missing the scopes we need)
//   'blocked' — Spotify is refusing this account (e.g. the app is in
//               Development Mode and the account isn't on its user list);
//               reconnecting will never fix it, so don't loop on it
//   null      — something else (network, bad data…)
function _authErrKind(e) {
  const m = (e.message || '').toLowerCase();
  if (e.status === 401) return 'reauth';
  if (e.status === 403 || m.includes('forbidden') || m.includes('403')) {
    if (m.includes('scope') ||
        SpotifyAuth.missingScopes(['playlist-read-private', 'playlist-read-collaborative']).length)
      return 'reauth';
    return 'blocked';
  }
  if (m.includes('scope') || m.includes('denied')) return 'reauth';
  return null;
}

function _blockedHtml(e, pad) {
  const who = S.user?.email || S.user?.id || 'the Spotify account you\'re logged in with';
  return `<div style="padding:${pad};text-align:left">
    <p style="color:var(--muted);margin-bottom:10px;line-height:1.6">
      Spotify refused this request — <strong>reconnecting won't fix it</strong>, so no
      point asking you to log in again.
    </p>
    <p style="font-size:12px;margin-bottom:12px;line-height:1.5">
      Error: <code style="word-break:break-word">${esc(e.message)}</code>
    </p>
    <p style="color:var(--muted);font-size:12px;line-height:1.7;margin-bottom:14px">
      Since Spotify's 2026 API change, an app can only read playlists
      <strong>you created or collaborate on</strong> (as <strong>${esc(who)}</strong>).
      Spotify-made playlists (Discover Weekly, Daily Mix…) and playlists you merely
      follow can't be imported at all. Workaround: in the Spotify app, open the
      playlist → <strong>⋯ → Add to other playlist → New playlist</strong>, then
      import your copy here.<br><br>
      If this is a playlist you own, check instead that <strong>${esc(who)}</strong>
      is listed under <strong>User Management</strong> for this app at
      <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" style="color:var(--accent)">developer.spotify.com/dashboard</a>.
    </p>
    <div style="text-align:center">
      <button class="reauth-trigger btn btn-secondary btn-sm">Reconnect anyway</button>
    </div>
  </div>`;
}

// Renders the right recovery UI for an auth-ish error. Returns false when the
// error isn't auth-related so the caller can show its own message.
function _renderAuthError(container, e, pad) {
  const kind = _authErrKind(e);
  if (!kind) return false;
  container.innerHTML = kind === 'reauth' ? _reauthHtml(pad) : _blockedHtml(e, pad);
  _bindReauth(container);
  return true;
}

function _reauthHtml(pad) {
  return `<div style="padding:${pad};text-align:center">
    <p style="color:var(--muted);margin-bottom:10px;line-height:1.5">
      Spotify needs updated permissions. Tap below to reconnect.
    </p>
    <button class="reauth-trigger btn btn-primary btn-sm">Reconnect Spotify</button>
    <p style="color:var(--muted);margin-top:14px;font-size:12px;line-height:1.6">
      If this keeps looping, you need to fully reset the app's Spotify access:<br>
      1. Go to <a href="https://www.spotify.com/account/apps" target="_blank" rel="noopener" style="color:var(--accent)">spotify.com/account/apps</a><br>
      2. Find <strong>Playball</strong> → click <strong>Remove Access</strong><br>
      3. Come back and log in again fresh
    </p>
  </div>`;
}

function _bindReauth(container) {
  container.querySelector('.reauth-trigger')?.addEventListener('click', () => {
    SpotifyAuth.logout(); SpotifyAuth.login(true);
  });
}

async function openImportModal() {
  $('import-modal').classList.remove('hidden');
  $('import-list').innerHTML = '<p class="hint" style="padding:20px">Loading your Spotify playlists…</p>';
  try {
    const playlists = await SpotifyAuth.getUserPlaylists();
    renderImportList(playlists);
  } catch (e) {
    const el = $('import-list');
    console.error('openImportModal failed:', e.status, e.message, '\nStored scopes:', localStorage.getItem('sp_scopes'));
    if (!_renderAuthError(el, e, '24px'))
      el.innerHTML = `<p class="hint" style="padding:20px;color:var(--danger)">Error: ${esc(e.message)}</p>`;
  }
}

function renderImportList(playlists) {
  if (!playlists.length) {
    $('import-list').innerHTML = '<p class="hint" style="padding:20px">No playlists found.</p>';
    return;
  }
  $('import-list').innerHTML = playlists.map(pl => {
    const img   = pl.images?.[0]?.url || '';
    const count = pl.tracks?.total ?? pl.items?.total;
    const countStr = count != null ? `${count} track${count !== 1 ? 's' : ''}` : '';
    // Spotify's 2026 policy: an app can only read the contents of playlists
    // the user created or collaborates on. Flag the rest so a failed tap
    // isn't a surprise (still tappable — collaborator detection is fuzzy).
    const readable = !S.user || pl.owner?.id === S.user.id || pl.collaborative;
    const metaStr  = readable ? countStr
      : `not importable — ${pl.owner?.id === 'spotify' ? 'made by Spotify' : 'not your playlist'}`;
    return `
      <div class="import-pl-item" data-id="${pl.id}" data-name="${esc(pl.name)}"${readable ? '' : ' style="opacity:.45"'}>
        ${img
          ? `<img class="import-pl-img" src="${img}" alt="" loading="lazy" />`
          : `<div class="import-pl-img import-pl-img--empty"></div>`
        }
        <div class="import-pl-info">
          <div class="import-pl-name">${esc(pl.name)}</div>
          ${metaStr ? `<div class="import-pl-meta">${esc(metaStr)}</div>` : ''}
        </div>
        <span class="import-pl-arrow">›</span>
      </div>`;
  }).join('');
  $('import-list').querySelectorAll('.import-pl-item').forEach(el =>
    el.addEventListener('click', () => importPlaylist(el.dataset.id, el.dataset.name))
  );
}

async function importPlaylist(spotifyId, name) {
  $('import-list').innerHTML =
    '<p class="hint" style="padding:20px">Importing tracks…</p>';
  try {
    const raw    = await SpotifyAuth.getPlaylistTracks(spotifyId);
    const tracks = raw.map(t => trackFromSpotify(t));

    // Re-importing a playlist we already have refreshes it (and keeps saved
    // start/end times for tracks that are still in it).
    const existingIdx = S.playlists.findIndex(p => p.spotifyId === spotifyId);
    if (existingIdx >= 0) {
      const existing = S.playlists[existingIdx];
      const oldById  = Object.fromEntries(existing.tracks.map(t => [t.id, t]));
      existing.tracks = tracks.map(t => oldById[t.id] ? { ...t, start_ms: oldById[t.id].start_ms, end_ms: oldById[t.id].end_ms } : t);
      existing.name   = name;
      S.activeIdx     = existingIdx;
      toast(`Refreshed "${name}" from Spotify`, 'success');
    } else {
      S.playlists.push({ name, tracks, spotifyId, docId: null, created: new Date().toISOString() });
      S.activeIdx = S.playlists.length - 1;
      toast(`Imported "${name}" — ${tracks.length} tracks`, 'success');
    }

    $('import-modal').classList.add('hidden');
    renderSidebar(); renderEditor();
    if (isMobile()) switchTab('editor');
  } catch (e) {
    const el = $('import-list');
    const storedScopes = localStorage.getItem('sp_scopes') || '(none stored)';
    console.error('importPlaylist failed:', e.status, e.message, '\nStored scopes:', storedScopes);
    if (_renderAuthError(el, e, '24px')) {
      el.innerHTML +=
        `<p style="font-size:11px;color:var(--muted);text-align:center;padding:4px 16px 12px;line-height:1.5">
          Error: <code>${esc(e.message)}</code><br>
          Scopes: <code style="word-break:break-all">${esc(storedScopes)}</code>
        </p>`;
      _bindReauth(el); // innerHTML += re-created the nodes; rebind the button
    } else {
      el.innerHTML = `<p class="hint" style="padding:20px;color:var(--danger)">Error: ${esc(e.message)}</p>`;
    }
  }
}

function closeImportModal() { $('import-modal').classList.add('hidden'); }

// ── Playlist CRUD ──────────────────────────────────────────────────────────
function createPlaylist() {
  S.playlists.push({ name: 'New Playlist', tracks: [], spotifyId: null, docId: null, created: new Date().toISOString() });
  S.activeIdx = S.playlists.length - 1;
  renderSidebar(); renderEditor();
  if (isMobile()) switchTab('editor');
  else { $('playlist-name').focus(); $('playlist-name').select(); }
}

function openPlaylist(i) {
  S.activeIdx = i;
  renderSidebar(); renderEditor();
  if (isMobile()) switchTab('editor');
}

async function savePlaylist(silent = false) {
  const pl = currentPlaylist();
  if (!pl) return;
  if (!S.store || !S.fbUser) {
    if (!silent) { toast('Sign in to save playlists.', 'error'); openAccountModal(); }
    return;
  }
  pl.name    = $('playlist-name').value.trim() || 'Untitled';
  pl.updated = new Date().toISOString();
  const btn  = $('save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    pl.docId = await S.store.savePlaylist(pl.docId, {
      name: pl.name, spotifyId: pl.spotifyId || null,
      created: pl.created || new Date().toISOString(), updated: pl.updated,
      tracks: pl.tracks,
    });
    if (!silent) toast('Playlist saved!', 'success');
    renderSidebar();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

// Push the current editor playlist's track order to Spotify.
// Creates the playlist on Spotify first if it isn't linked yet.
async function syncPlaylistToSpotify() {
  const pl = currentPlaylist();
  if (!pl || !pl.tracks.length) return;
  const btn = $('sync-btn');
  btn.disabled = true; btn.textContent = 'Syncing…';
  try {
    if (!pl.spotifyId) {
      pl.name = $('playlist-name').value.trim() || 'Untitled';
      pl.spotifyId = await SpotifyAuth.createPlaylist(pl.name, 'Created with Playball');
    }
    await SpotifyAuth.replacePlaylistTracks(pl.spotifyId, pl.tracks.map(t => 'spotify:track:' + t.id));
    toast('Synced to Spotify!', 'success');
    if (S.fbUser) await savePlaylist(true); // persist the spotifyId link
    renderSidebar(); renderEditor();
  } catch (e) {
    const kind = _authErrKind(e);
    if (kind === 'reauth') {
      toast('Needs playlist permissions — re-authorizing…', '');
      setTimeout(() => { SpotifyAuth.logout(); SpotifyAuth.login(true); }, 1500);
    } else if (kind === 'blocked') {
      toast('Spotify refused access — add this account under User Management in the Spotify dev dashboard. (' + e.message + ')', 'error');
    } else {
      toast('Sync failed: ' + e.message, 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = pl.spotifyId ? 'Sync to Spotify' : 'Create on Spotify';
  }
}

async function deletePlaylist() {
  const pl = currentPlaylist();
  if (!pl || !confirm(`Delete "${pl.name}"? (This won't touch the playlist on Spotify.)`)) return;
  if (pl.docId && S.store && S.fbUser) {
    try { await S.store.deletePlaylist(pl.docId); }
    catch (e) { toast('Delete failed: ' + e.message, 'error'); return; }
  }
  S.playlists.splice(S.activeIdx, 1);
  S.activeIdx = -1;
  renderSidebar(); renderEditor();
  toast('Playlist deleted.');
}

async function loadSavedPlaylists() {
  if (!S.store || !S.fbUser) return;
  try {
    const remote = await S.store.listPlaylists();
    remote.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const activeName = currentPlaylist()?.name;
    S.playlists = [...remote, ...S.playlists.filter(p => !p.docId)];
    if (activeName) S.activeIdx = S.playlists.findIndex(p => p.name === activeName);
    renderSidebar(); renderEditor();
  } catch (e) {
    console.error('loadSavedPlaylists:', e);
    toast('Could not load saved playlists: ' + e.message, 'error');
  }
}

// One-time import of playlists saved by the old GitHub-based app.
async function importLegacyPlaylists() {
  const repo = window.APP_CONFIG?.legacy_repo;
  if (!repo) return;
  const btn = $('legacy-import-btn');
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const dirs = await fetch(`https://api.github.com/repos/${repo}/contents/playlists`).then(r => r.ok ? r.json() : []);
    let count = 0;
    for (const d of (Array.isArray(dirs) ? dirs : []).filter(x => x.type === 'dir')) {
      const files = await fetch(d.url).then(r => r.ok ? r.json() : []);
      for (const f of (Array.isArray(files) ? files : []).filter(x => x.name.endsWith('.json'))) {
        const data = await fetch(f.download_url).then(r => r.ok ? r.json() : null);
        if (!data?.tracks) continue;
        const pl = { name: data.name || f.name.replace(/\.json$/, ''), tracks: data.tracks,
                     spotifyId: null, docId: null, created: data.created || new Date().toISOString() };
        S.playlists.push(pl);
        if (S.fbUser && S.store) {
          pl.docId = await S.store.savePlaylist(null, { name: pl.name, spotifyId: null,
            created: pl.created, updated: new Date().toISOString(), tracks: pl.tracks });
        }
        count++;
      }
    }
    renderSidebar();
    toast(count ? `Imported ${count} legacy playlist${count !== 1 ? 's' : ''}${S.fbUser ? ' (saved to your account)' : ''}` : 'No legacy playlists found.', count ? 'success' : '');
  } catch (e) {
    toast('Legacy import failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Import legacy playlists';
  }
}

// ── Lineup (batting order) ─────────────────────────────────────────────────
const L = {
  playlistId:   null,
  playlistName: null,
  entries:      [],   // { trackId, trackUri, name, artist, image, playerName }
  pickerOpen:   false,
  saveTimer:    null,
  syncTimer:    null,
};

async function toggleLineupPicker() {
  const picker = $('lineup-picker');
  if (L.pickerOpen) {
    picker.classList.add('hidden');
    L.pickerOpen = false;
    return;
  }
  L.pickerOpen = true;
  picker.classList.remove('hidden');
  picker.innerHTML = '<p class="hint" style="padding:14px">Loading your playlists…</p>';

  try {
    const pls = await SpotifyAuth.getUserPlaylists();
    if (!pls.length) { picker.innerHTML = '<p class="hint" style="padding:14px">No playlists found.</p>'; return; }
    picker.innerHTML = pls.map(pl => {
      const img = pl.images?.[0]?.url || '';
      return `<div class="lu-pick-item" data-id="${pl.id}" data-name="${esc(pl.name)}">
        ${img ? `<img class="lu-pick-img" src="${img}" alt="" loading="lazy" />` : '<div class="lu-pick-img lu-pick-img--empty"></div>'}
        <span class="lu-pick-name">${esc(pl.name)}</span>
      </div>`;
    }).join('');
    picker.querySelectorAll('.lu-pick-item').forEach(el =>
      el.addEventListener('click', () => loadLineupPlaylist(el.dataset.id, el.dataset.name))
    );
  } catch (e) {
    if (!_renderAuthError(picker, e, '14px'))
      picker.innerHTML = `<p class="hint" style="padding:14px;color:var(--danger)">Error: ${esc(e.message)}</p>`;
  }
}

async function loadLineupPlaylist(playlistId, playlistName) {
  $('lineup-picker').classList.add('hidden');
  L.pickerOpen = false;
  $('lineup-pl-name').textContent = playlistName;
  $('lineup-list').innerHTML = '<p class="hint" style="padding:28px 20px">Loading tracks…</p>';
  L.playlistId = playlistId; L.playlistName = playlistName;
  L.entries = [];

  try {
    const tracks = await SpotifyAuth.getPlaylistTracks(playlistId);

    // Player names live in Firestore, keyed by track id. Spotify is the
    // source of truth for order — we sync order back to it on every drag.
    let savedNames = {};
    if (S.store && S.fbUser) {
      try {
        const saved = await S.store.loadLineup(playlistId);
        if (saved) savedNames = saved.names || {};
      } catch (e) { console.warn('loadLineup:', e); }
    }

    L.entries = tracks.map(t => ({
      trackId:    t.id,
      trackUri:   `spotify:track:${t.id}`,
      name:       t.name,
      artist:     (t.artists || []).map(a => a.name).join(', '),
      image:      t.album?.images?.[0]?.url || '',
      playerName: savedNames[t.id] || '',
    }));

    renderLineup();
    $('lineup-sync-btn').classList.remove('hidden');
    lineupStatus(S.fbUser ? 'Drag to reorder — order syncs to Spotify, names save automatically.'
                          : 'Drag to reorder — sign in to save player names.');
  } catch (e) {
    $('lineup-list').innerHTML = `<p class="hint" style="padding:28px 20px;color:var(--danger)">Error: ${esc(e.message)}</p>`;
  }
}

function lineupStatus(text, cls = '') {
  const el = $('lineup-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'lineup-status' + (cls ? ' ' + cls : '');
}

function renderLineup() {
  const list = $('lineup-list');
  if (!L.entries.length) {
    list.innerHTML = '<p class="hint" style="padding:28px 20px">No tracks in this playlist.</p>';
    return;
  }
  list.innerHTML = L.entries.map((e, i) => `
    <div class="lu-item" data-id="${e.trackId}">
      <span class="lu-drag" title="Drag to reorder">⠿</span>
      <span class="lu-num">${i + 1}</span>
      ${e.image ? `<img class="lu-art" src="${e.image}" alt="" loading="lazy" />` : '<div class="lu-art lu-art--empty"></div>'}
      <div class="lu-info">
        <div class="lu-song">${esc(e.name)}</div>
        <div class="lu-artist">${esc(e.artist)}</div>
      </div>
      <input class="lu-name" type="text" placeholder="Player name…" value="${esc(e.playerName)}" />
    </div>`).join('');

  // Player name edits → save names (debounced), no Spotify sync needed
  list.querySelectorAll('.lu-name').forEach(inp =>
    inp.addEventListener('input', () => {
      L.entries = _lineupEntriesFromDOM();
      scheduleLineupSave();
    })
  );
}

function _renumberLineup() {
  [...$('lineup-list').querySelectorAll('.lu-num')].forEach((el, i) => { el.textContent = i + 1; });
}

function _lineupEntriesFromDOM() {
  const byId = Object.fromEntries(L.entries.map(e => [e.trackId, e]));
  return [...$('lineup-list').querySelectorAll('.lu-item')].map(el => ({
    ...byId[el.dataset.id],
    playerName: el.querySelector('.lu-name')?.value ?? byId[el.dataset.id]?.playerName ?? '',
  })).filter(Boolean);
}

// Debounced Firestore save of names + order
function scheduleLineupSave() {
  if (!S.store || !S.fbUser || !L.playlistId) return;
  clearTimeout(L.saveTimer);
  L.saveTimer = setTimeout(async () => {
    try {
      const names = {};
      L.entries.forEach(e => { if (e.playerName) names[e.trackId] = e.playerName; });
      await S.store.saveLineup(L.playlistId, {
        playlistId:   L.playlistId,
        playlistName: L.playlistName,
        names,
        order: L.entries.map(e => e.trackId),
      });
      lineupStatus('✓ Lineup saved', 'ok');
    } catch (e) {
      lineupStatus('Save failed: ' + e.message, 'err');
    }
  }, 900);
}

// Debounced Spotify order sync (fires after drag-and-drop settles)
function scheduleSpotifySync() {
  if (!L.playlistId) return;
  clearTimeout(L.syncTimer);
  lineupStatus('Syncing order to Spotify…');
  L.syncTimer = setTimeout(() => syncLineupToSpotify(true), 1200);
}

async function syncLineupToSpotify(auto = false) {
  if (!L.playlistId) return;
  const btn = $('lineup-sync-btn');
  btn.disabled = true; if (!auto) btn.textContent = 'Syncing…';
  try {
    L.entries = _lineupEntriesFromDOM();
    await SpotifyAuth.replacePlaylistTracks(L.playlistId, L.entries.map(e => e.trackUri));
    lineupStatus('✓ Order synced to Spotify', 'ok');
    if (!auto) toast('Playlist order synced to Spotify!', 'success');
  } catch (e) {
    const kind = _authErrKind(e);
    if (kind === 'reauth') {
      toast('Needs playlist permissions — re-authorizing…', '');
      setTimeout(() => { SpotifyAuth.logout(); SpotifyAuth.login(true); }, 1500);
    } else if (kind === 'blocked') {
      lineupStatus('Spotify refused access — see the dev dashboard\'s User Management. (' + e.message + ')', 'err');
    } else {
      lineupStatus('Sync failed: ' + e.message, 'err');
      if (!auto) toast('Sync failed: ' + e.message, 'error');
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Sync to Spotify';
  }
}

function initLineupDrag() {
  const list = $('lineup-list');
  let dragging = null;
  list.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.lu-drag');
    if (!handle) return;
    const item = handle.closest('.lu-item');
    if (!item) return;
    e.preventDefault();
    dragging = item;
    item.classList.add('lu-dragging');
    handle.setPointerCapture(e.pointerId);
  }, { passive: false });

  list.addEventListener('pointermove', e => {
    if (!dragging) return;
    const siblings = [...list.querySelectorAll('.lu-item:not(.lu-dragging)')];
    const target = siblings.find(el => {
      const r = el.getBoundingClientRect();
      return e.clientY > r.top && e.clientY < r.bottom;
    });
    if (target) {
      const r = target.getBoundingClientRect();
      list.insertBefore(dragging, e.clientY < r.top + r.height / 2 ? target : target.nextSibling);
    }
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging.classList.remove('lu-dragging');
    dragging = null;
    const before = L.entries.map(e => e.trackId).join(',');
    L.entries = _lineupEntriesFromDOM();
    _renumberLineup();
    if (L.entries.map(e => e.trackId).join(',') !== before) {
      scheduleLineupSave();
      scheduleSpotifySync();
    }
  };
  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);
}

// ── App init ───────────────────────────────────────────────────────────────
async function launchApp() {
  $('auth-overlay').classList.add('hidden');
  $('app').classList.remove('hidden');

  S.user = await SpotifyAuth.getUser();
  $('user-display').textContent = S.user.display_name || S.user.id;

  if (isMobile()) switchTab('editor');

  initSDK()
    .then(() => { toast('Player ready', 'success'); initScrubbing(); })
    .catch(err => { console.warn('SDK:', err); toast('Playback unavailable (Premium required).', 'error'); });

  // Reconnect when the user returns to the app (tab focus or phone unlock)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.sdkPlayer && !S.deviceId) {
      S.sdkPlayer.connect().catch(console.warn);
    }
  });

  // Search
  $('search-input').addEventListener('input', e => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => doSearch(e.target.value), 380);
  });
  document.addEventListener('click', e => {
    if (!$('search-results').contains(e.target) && e.target !== $('search-input'))
      $('search-results').classList.add('hidden');
  });

  // Sidebar
  $('new-playlist-btn').addEventListener('click', createPlaylist);
  $('import-btn').addEventListener('click', openImportModal);
  $('legacy-import-btn')?.addEventListener('click', importLegacyPlaylists);

  // Import modal
  $('close-import').addEventListener('click', closeImportModal);
  $('import-modal').querySelector('.modal-bg').addEventListener('click', closeImportModal);

  // Account modal
  $('close-account').addEventListener('click', closeAccountModal);
  $('account-modal').querySelector('.modal-bg').addEventListener('click', closeAccountModal);

  // Lineup
  $('lineup-toggle-btn')?.addEventListener('click', () =>
    switchTab($('app').classList.contains('show-lineup') ? 'editor' : 'lineup')
  );
  $('lineup-pick-btn').addEventListener('click', toggleLineupPicker);
  $('lineup-sync-btn').addEventListener('click', () => syncLineupToSpotify(false));
  initLineupDrag();

  // Editor
  $('playlist-name').addEventListener('input', e => {
    if (currentPlaylist()) { currentPlaylist().name = e.target.value; renderSidebar(); }
  });
  $('play-all-btn').addEventListener('click', () => { if (currentPlaylist()?.tracks.length) playAt(0); });
  $('save-btn').addEventListener('click', () => savePlaylist(false));
  $('sync-btn').addEventListener('click', syncPlaylistToSpotify);
  $('delete-btn').addEventListener('click', deletePlaylist);

  // Logout (Spotify)
  $('logout-btn').addEventListener('click', () => {
    if (confirm('Log out of Spotify?')) { SpotifyAuth.logout(); location.reload(); }
  });

  // Desktop player bar
  $('pp-btn').addEventListener('click', togglePlayback);
  $('prev-btn').addEventListener('click', () => { if (S.nowIdx > 0) playAt(S.nowIdx - 1); });
  $('next-btn').addEventListener('click', () => {
    const pl = currentPlaylist();
    if (pl && S.nowIdx < pl.tracks.length - 1) playAt(S.nowIdx + 1);
  });

  // Mobile player
  $('mp-pp').addEventListener('click', togglePlayback);
  $('mp-prev').addEventListener('click', () => { if (S.nowIdx > 0) playAt(S.nowIdx - 1); });
  $('mp-next').addEventListener('click', () => {
    const pl = currentPlaylist();
    if (pl && S.nowIdx < pl.tracks.length - 1) playAt(S.nowIdx + 1);
  });

  // Mobile nav
  document.querySelectorAll('.mnav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // PWA install
  $('install-btn')?.addEventListener('click', async () => {
    if (!S.installEvt) return;
    S.installEvt.prompt();
    const { outcome } = await S.installEvt.userChoice;
    if (outcome === 'accepted') $('install-btn').classList.add('hidden');
  });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); S.installEvt = e;
  $('install-btn')?.classList.remove('hidden');
});

(async () => {
  const clientId = window.APP_CONFIG?.spotify_client_id || '';
  if (!clientId || clientId === 'YOUR_SPOTIFY_CLIENT_ID_HERE')
    $('config-warning').classList.remove('hidden');

  initStore(); // fire-and-forget; auth state callback wires up the rest

  const params  = new URLSearchParams(window.location.search);
  const code    = params.get('code');
  const authErr = params.get('error');
  if (code || authErr) {
    history.replaceState({}, '', window.location.pathname);
    if (code) {
      // On failure fall through to the login screen (with a working button)
      // instead of leaving the user on a dead page.
      try { await SpotifyAuth.handleCallback(code); await launchApp(); return; }
      catch (e) { toast('Spotify login failed: ' + e.message, 'error'); console.error(e); }
    } else {
      toast('Spotify login was cancelled or denied.', 'error');
    }
  }

  if (SpotifyAuth.isLoggedIn()) { await launchApp(); return; }

  $('spotify-login-btn').addEventListener('click', () => SpotifyAuth.login());
  $('install-btn')?.addEventListener('click', async () => {
    if (!S.installEvt) return;
    S.installEvt.prompt();
    const { outcome } = await S.installEvt.userChoice;
    if (outcome === 'accepted') $('install-btn').classList.add('hidden');
  });
})();
