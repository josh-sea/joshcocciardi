// PSX Station — library UI and emulator lifecycle.
//
// Two views behind a hash route: #/ is the library, #/play/<discId> boots the
// emulator. EmulatorJS has no teardown API (it mounts a canvas, a WASM core and
// a pile of listeners and expects to own the page), so switching between the
// two reloads rather than trying to unwind it. That costs nothing in practice:
// EmulatorJS caches its cores in IndexedDB, and the disc is already local.

const CFG = window.APP_CONFIG;

let Library, Store;

const state = {
  discs: [],        // local rows from IndexedDB, newest-played first
  cloud: {},        // discId -> Firestore metadata (states map, card timestamps)
  user: null,
  discId: null,     // set while the player view is up
  disc: null,
  gm: null,         // EmulatorJS gameManager, once the core has booted
  playStartedAt: 0,
  cardTimer: 0,
  cloudReady: null,   // resolves once the first auth callback has settled
};

let markCloudReady = () => {};
state.cloudReady = new Promise(resolve => { markCloudReady = resolve; });

/* ── Tiny DOM helpers ──────────────────────────────────────────────────── */

const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const mins = s / 60;
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.floor(hrs)}h ago`;
  const days = hrs / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function fmtPlaytime(ms) {
  if (!ms || ms < 60000) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m played`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m played`;
}

function toast(message, kind = 'info', ms = 3600) {
  const node = el('div', { class: `toast toast-${kind}` }, message);
  $('#toasts').appendChild(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 250);
  }, ms);
}

// Modal that resolves with the value passed to its close callback, or null if
// the backdrop / Escape dismisses it.
function modal(title, buildBody) {
  return new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('in');
      setTimeout(() => backdrop.remove(), 200);
      resolve(value === undefined ? null : value);
    };
    const onKey = e => { if (e.key === 'Escape') done(null); };

    const body = el('div', { class: 'modal-body' });
    const card = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'modal-head' },
        el('strong', {}, title),
        el('button', {
          class: 'icon-btn', 'aria-label': 'Close', onclick: () => done(null),
          html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
        }),
      ),
      body,
    );
    const backdrop = el('div', {
      class: 'backdrop',
      onclick: e => { if (e.target === backdrop) done(null); },
    }, card);

    buildBody(body, done);
    $('#modal-root').appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => backdrop.classList.add('in'));
    card.querySelector('button, input, [tabindex]')?.focus();
  });
}

function confirmDialog(title, message, confirmLabel = 'Confirm', danger = true) {
  return modal(title, (body, done) => {
    body.appendChild(el('p', { class: 'muted' }, message));
    body.appendChild(el('div', { class: 'modal-actions' },
      el('button', { class: 'btn btn-ghost', onclick: () => done(false) }, 'Cancel'),
      el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => done(true) }, confirmLabel),
    ));
  }).then(v => v === true);
}

// EmulatorJS hands back Uint8Arrays; IndexedDB may hand back Blobs or
// ArrayBuffers depending on what was stored. Normalize before either is used.
async function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

/* ── Routing ───────────────────────────────────────────────────────────── */

function parseRoute() {
  const m = /^#\/play\/([a-f0-9]+)$/.exec(location.hash);
  return m ? { view: 'play', discId: m[1] } : { view: 'library' };
}

// Any move into or out of a booted emulator goes through a reload — see the
// note at the top of this file.
function navigate(hash) {
  if (state.discId) {
    location.hash = hash;
    location.reload();
  } else {
    location.hash = hash;
  }
}

/* ── Library view ──────────────────────────────────────────────────────── */

async function refreshLibrary() {
  state.discs = await Library.listGames();
  renderLibrary();
  renderStorage();
}

function renderLibrary() {
  const grid = $('#grid');
  grid.textContent = '';
  $('#empty').hidden = state.discs.length > 0;
  $('#lib-count').textContent = state.discs.length
    ? `Library · ${state.discs.length} ${state.discs.length === 1 ? 'disc' : 'discs'}`
    : 'Library';

  for (const disc of state.discs) {
    grid.appendChild(discCard(disc));
  }
}

function discCard(disc) {
  const cloud = state.cloud[disc.id];
  const cloudSlots = cloud?.states ? Object.keys(cloud.states).length : 0;
  const played = fmtPlaytime(disc.playMs);

  const badges = el('div', { class: 'card-badges' },
    el('span', { class: 'badge' }, fmtBytes(disc.size)),
    disc.lastPlayedAt ? el('span', { class: 'badge' }, `played ${fmtAgo(disc.lastPlayedAt)}`) : null,
    played ? el('span', { class: 'badge' }, played) : null,
    cloudSlots ? el('span', { class: 'badge badge-cloud' }, `☁ ${cloudSlots} save${cloudSlots === 1 ? '' : 's'}`) : null,
  );

  return el('article', { class: 'card' },
    el('button', {
      class: 'card-art', 'aria-label': `Play ${disc.title}`,
      onclick: () => navigate(`#/play/${disc.id}`),
    },
      el('span', { class: 'card-disc', 'aria-hidden': 'true' }),
      el('span', { class: 'card-play', 'aria-hidden': 'true' }, '▶'),
    ),
    el('div', { class: 'card-body' },
      el('h3', { class: 'card-title', title: disc.fileName }, disc.title),
      badges,
    ),
    el('div', { class: 'card-actions' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => navigate(`#/play/${disc.id}`) }, 'Play'),
      el('button', {
        class: 'btn btn-ghost btn-sm', onclick: () => renameDisc(disc), title: 'Rename',
      }, 'Rename'),
      el('button', {
        class: 'btn btn-ghost btn-sm btn-danger-ghost', onclick: () => removeDisc(disc), title: 'Remove from this device',
      }, 'Remove'),
    ),
  );
}

async function renameDisc(disc) {
  const next = await modal('Rename disc', (body, done) => {
    const input = el('input', { class: 'input', type: 'text', value: disc.title, maxlength: '120' });
    const submit = () => done(input.value.trim());
    body.appendChild(el('label', { class: 'field' },
      el('span', { class: 'muted' }, 'Title shown in your library'),
      input,
    ));
    body.appendChild(el('p', { class: 'muted tiny' }, `File: ${disc.fileName}`));
    body.appendChild(el('div', { class: 'modal-actions' },
      el('button', { class: 'btn btn-ghost', onclick: () => done(null) }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: submit }, 'Save'),
    ));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  });
  if (!next || next === disc.title) return;
  await Library.patchGame(disc.id, { title: next });
  if (Store.signedIn()) {
    Store.putGame(disc.id, { title: next }).catch(e => console.warn('[psx] title sync:', e.message));
  }
  await refreshLibrary();
}

async function removeDisc(disc) {
  const cloudMeta = state.cloud[disc.id];
  const slots = Object.keys(cloudMeta?.states || {});
  // Keeping cloud saves is the right default — you remove a disc to reclaim
  // space, not to throw away 40 hours — but there has to be a way to purge
  // them, or they'd be orphaned in Storage with nothing pointing at them.
  const hasCloud = Store.signedIn() && (slots.length > 0 || !!cloudMeta?.cardUpdatedAt);

  const choice = await modal('Remove disc', (body, done) => {
    body.appendChild(el('p', { class: 'muted' },
      `Removes "${disc.title}" and its local saves from this device. The original file on your computer isn't touched.`));
    if (hasCloud) {
      body.appendChild(el('p', { class: 'muted' },
        `You have ${slots.length ? `${slots.length} cloud save state${slots.length === 1 ? '' : 's'}` : 'a cloud memory card'} for it. `
        + 'Keep them and they reattach the next time you add this same file.'));
    }
    body.appendChild(el('div', { class: 'modal-actions' },
      el('button', { class: 'btn btn-ghost', onclick: () => done(null) }, 'Cancel'),
      hasCloud ? el('button', { class: 'btn btn-ghost btn-danger-ghost', onclick: () => done('all') }, 'Also delete cloud saves') : null,
      el('button', { class: 'btn btn-danger', onclick: () => done('local') }, hasCloud ? 'Keep cloud saves' : 'Remove'),
    ));
  });
  if (!choice) return;

  await Library.deleteGame(disc.id);
  if (choice === 'all') {
    try {
      await Store.purgeSaves(disc.id, slots);
      delete state.cloud[disc.id];
    } catch (e) {
      toast(`Removed from this device, but the cloud saves could not be deleted: ${e.message}`, 'warn', 6000);
    }
  }
  await refreshLibrary();
  toast(`Removed ${disc.title}`);
}

/* ── Adding discs ──────────────────────────────────────────────────────── */

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const progress = $('#dropzone-progress');
  const fill = $('#dz-bar-fill');
  const status = $('#dz-status');
  progress.hidden = false;

  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    status.textContent = `Reading ${file.name}…`;
    fill.style.width = `${(i / files.length) * 100}%`;
    try {
      if (file.size > CFG.large_disc_warn_bytes) {
        toast(`${file.name} is ${fmtBytes(file.size)} — large discs can run out of memory on phones.`, 'warn', 6000);
      }
      const { row, wasExisting } = await Library.addGame(file);
      added++;
      if (Store.signedIn()) {
        Store.putGame(row.id, { title: row.title, fileName: row.fileName, size: row.size })
          .catch(e => console.warn('[psx] metadata sync:', e.message));
      }
      if (wasExisting) toast(`${row.title} was already in your library — relinked to this file.`, 'info');
    } catch (e) {
      console.error('[psx] add failed', e);
      toast(`Couldn't add ${file.name}: ${e.message}`, 'error', 6000);
    }
  }

  fill.style.width = '100%';
  status.textContent = added ? `Added ${added} disc${added === 1 ? '' : 's'}.` : 'Nothing added.';
  setTimeout(() => { progress.hidden = true; fill.style.width = '0%'; }, 1400);

  await refreshLibrary();
  if (added) Library.requestPersistence();
}

function wireDropzone() {
  const dz = $('#dropzone');
  const input = $('#file-input');
  input.accept = CFG.accepted_extensions.join(',');

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

  // Dragging anywhere on the page should work, not just over the dashed box.
  let depth = 0;
  const over = e => { e.preventDefault(); depth++; dz.classList.add('drag'); };
  const out = e => { e.preventDefault(); if (--depth <= 0) { depth = 0; dz.classList.remove('drag'); } };
  document.addEventListener('dragenter', over);
  document.addEventListener('dragleave', out);
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    depth = 0;
    dz.classList.remove('drag');
    addFiles(e.dataTransfer?.files);
  });
}

/* ── Device storage ────────────────────────────────────────────────────── */

async function renderStorage() {
  const meter = $('#storage-meter');
  if (!state.discs.length) { meter.hidden = true; return; }

  // Report the library's own size rather than estimate().usage: browsers
  // account for IndexedDB blobs lazily, so usage can read near-zero right
  // after a 600MB disc lands. The quota is trustworthy; the usage isn't.
  const used = state.discs.reduce((n, d) => n + (d.size || 0), 0);
  const quota = (await Library.estimate())?.quota || 0;

  meter.hidden = false;
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  $('#meter-fill').style.width = `${pct}%`;
  $('#meter-fill').classList.toggle('hot', pct > 85);
  $('#meter-label').textContent = quota
    ? `${fmtBytes(used)} of discs · ${fmtBytes(quota)} available here`
    : `${fmtBytes(used)} of discs on this device`;
}

/* ── Auth ──────────────────────────────────────────────────────────────── */

function wireAuth() {
  if (Store.offline) {
    const btn = $('#btn-auth');
    btn.textContent = 'Offline';
    btn.disabled = true;
    btn.title = `${Store.reason} Your library and saves still work on this device.`;
    markCloudReady();
    return;
  }

  $('#btn-auth').addEventListener('click', async () => {
    if (Store.signedIn()) {
      const ok = await confirmDialog('Sign out', 'Your discs stay on this device. Cloud saves stay in your account.', 'Sign out', false);
      if (ok) await Store.signOut();
    } else {
      try { await Store.signInGoogle(); }
      catch (e) { toast(`Sign-in failed: ${e.message}`, 'error', 6000); }
    }
  });

  Store.onAuth(async user => {
    state.user = user;
    const btn = $('#btn-auth');
    btn.textContent = user ? (user.displayName?.split(' ')[0] || 'Signed in') : 'Sign in';
    btn.classList.toggle('btn-signed', !!user);
    btn.title = user ? `Signed in as ${user.email || user.displayName} — click to sign out` : 'Sign in to sync save states';

    if (user) {
      try {
        state.cloud = await Store.listGames();
      } catch (e) {
        console.warn('[psx] cloud list failed:', e.message);
        state.cloud = {};
      }
    } else {
      state.cloud = {};
    }
    markCloudReady();

    if (state.discId) renderSlots();
    else renderLibrary();
  });
}

/* ── Settings ──────────────────────────────────────────────────────────── */

async function openSettings() {
  const bios = await Library.getBios();
  const est = await Library.estimate();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;

  await modal('Settings', (body, done) => {
    /* BIOS */
    const biosRow = el('div', { class: 'setting' });
    const renderBios = current => {
      biosRow.textContent = '';
      biosRow.appendChild(el('div', { class: 'setting-head' },
        el('strong', {}, 'PlayStation BIOS'),
        el('span', { class: 'muted tiny' },
          current ? `${current.fileName} · ${fmtBytes(current.size)}` : 'Not set'),
      ));
      biosRow.appendChild(el('p', { class: 'muted tiny' },
        'Optional. The default core (pcsx_rearmed) has a built-in HLE BIOS and plays most discs without one. '
        + 'The accurate core (mednafen_psx_hw) will not start until you add a real BIOS dump from your own console. '
        + 'A BIOS you add here stays in this browser and is never uploaded.'));
      biosRow.appendChild(el('div', { class: 'setting-actions' },
        el('button', {
          class: 'btn btn-ghost btn-sm',
          onclick: () => {
            const input = $('#bios-input');
            input.onchange = async () => {
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              const row = await Library.setBios(file);
              renderBios(row);
              toast('BIOS saved to this device.');
            };
            input.click();
          },
        }, current ? 'Replace' : 'Add BIOS'),
        current ? el('button', {
          class: 'btn btn-ghost btn-sm btn-danger-ghost',
          onclick: async () => { await Library.clearBios(); renderBios(null); toast('BIOS removed.'); },
        }, 'Remove') : null,
      ));
    };
    renderBios(bios);
    body.appendChild(biosRow);

    /* Storage */
    const storageRow = el('div', { class: 'setting' },
      el('div', { class: 'setting-head' },
        el('strong', {}, 'Device storage'),
        el('span', { class: 'muted tiny' },
          est ? `${fmtBytes(est.usage)} of ${fmtBytes(est.quota)}` : 'unavailable'),
      ),
      el('p', { class: 'muted tiny' },
        persisted
          ? 'This library is marked persistent — the browser will not evict it to reclaim space.'
          : 'Without persistence the browser may evict your discs when the device runs low on space.'),
      persisted ? null : el('div', { class: 'setting-actions' },
        el('button', {
          class: 'btn btn-ghost btn-sm',
          onclick: async e => {
            const granted = await Library.requestPersistence();
            toast(granted ? 'Library marked persistent.' : 'The browser declined — visit the site more often, or install it, and try again.', granted ? 'info' : 'warn', 5000);
            if (granted) e.target.closest('.setting-actions')?.remove();
          },
        }, 'Request persistence'),
      ),
    );
    body.appendChild(storageRow);

    /* Cloud saves */
    body.appendChild(el('div', { class: 'setting' },
      el('div', { class: 'setting-head' }, el('strong', {}, 'Cloud saves')),
      el('p', { class: 'muted tiny' },
        Store.offline
          ? `${Store.reason} Everything still works on this device — discs, save states and memory cards are all stored locally.`
          : state.user
            ? `Signed in as ${state.user.email || state.user.displayName}. Save states and memory cards sync automatically; disc images never leave this device.`
            : 'Sign in to sync save states and memory cards across devices. Disc images always stay local.'),
    ));

    body.appendChild(el('div', { class: 'modal-actions' },
      el('button', { class: 'btn btn-primary', onclick: () => done(true) }, 'Done'),
    ));
  });

  renderStorage();
}

/* ── Player ────────────────────────────────────────────────────────────── */

async function bootPlayer(discId) {
  const disc = await Library.getGame(discId);
  if (!disc) {
    toast('That disc is no longer in your library.', 'warn');
    location.hash = '#/';
    return;
  }

  state.discId = discId;
  state.disc = disc;

  $('#view-library').hidden = true;
  $('#view-player').hidden = false;
  $('#player-title').textContent = disc.title;
  document.title = `${disc.title} — PSX Station`;
  document.body.classList.add('playing');

  // A File carries the name EmulatorJS sniffs for cue/bin handling. IndexedDB
  // usually round-trips the original File intact; wrap it only if it came back
  // as a bare Blob.
  const discFile = disc.blob instanceof File
    ? disc.blob
    : new File([disc.blob], disc.fileName, { type: 'application/octet-stream' });

  const bios = await Library.getBios();

  window.EJS_player = '#game';
  window.EJS_pathtodata = CFG.emulator_data_path;
  window.EJS_core = CFG.emulator_core;
  window.EJS_color = CFG.emulator_color;
  window.EJS_gameUrl = discFile;
  window.EJS_gameName = disc.title;
  // Namespaces EmulatorJS's own in-browser state slots per disc so two games
  // can't overwrite each other's quick saves.
  window.EJS_gameID = discId;
  window.EJS_startOnLoaded = true;
  // We already hold the disc in our own IndexedDB; don't let EmulatorJS keep a
  // second copy of it in its ROM cache.
  window.EJS_CacheLimit = 0;
  if (bios) {
    window.EJS_biosUrl = bios.blob instanceof File
      ? bios.blob
      : new File([bios.blob], bios.fileName, { type: 'application/octet-stream' });
  }
  window.EJS_onGameStart = onGameStart;

  const script = el('script', { src: `${CFG.emulator_data_path}loader.js` });
  script.onerror = () => showBootError();
  document.body.appendChild(script);

  // A blocked or stalled CDN request can leave a <script> that fires neither
  // load nor error — the tab just sits on a black rectangle forever. Watch for
  // the emulator actually appearing instead of trusting the events.
  const startedAt = Date.now();
  const watchdog = setInterval(() => {
    if (window.EJS_emulator) return clearInterval(watchdog);
    if (Date.now() - startedAt > CFG.emulator_boot_timeout_ms) {
      clearInterval(watchdog);
      showBootError();
    }
  }, 500);

  renderSlots();
}

function showBootError() {
  const host = $('#game');
  if (host.querySelector('.boot-error')) return;
  host.appendChild(el('div', { class: 'boot-error' },
    el('p', {}, 'The emulator could not be loaded.'),
    el('p', { class: 'muted tiny' },
      `PSX Station pulls the emulator from ${new URL(CFG.emulator_data_path).host} each visit, so it needs a `
      + 'connection to start a game — your discs and saves are all still here on the device. '
      + 'A content blocker can also swallow the request.'),
    el('div', { class: 'boot-error-actions' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => location.reload() }, 'Try again'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate('#/') }, 'Back to library'),
    ),
  ));
}

async function onGameStart() {
  state.gm = window.EJS_emulator?.gameManager || null;
  state.playStartedAt = Date.now();

  const stamp = Date.now();
  Library.patchGame(state.discId, { lastPlayedAt: stamp });
  if (Store.signedIn()) {
    Store.putGame(state.discId, {
      title: state.disc.title, fileName: state.disc.fileName, size: state.disc.size, lastPlayedAt: stamp,
    }).catch(e => console.warn('[psx] play sync:', e.message));
  }

  // Knowing whether the cloud holds a newer memory card requires the metadata,
  // but a slow or offline auth check must not hold the game hostage.
  await Promise.race([state.cloudReady, new Promise(r => setTimeout(r, 4000))]);
  await restoreMemoryCard();

  // The memory card is small, so checkpoint it on a timer as well as on exit —
  // a crashed tab shouldn't cost an hour of in-game saves.
  state.cardTimer = setInterval(() => persistMemoryCard(false), 60000);
  renderSlots();
}

/* ── Memory card (in-game saves) ───────────────────────────────────────── */

function writeSaveFileInto(gm, bytes) {
  const path = gm.getSaveFilePath?.();
  if (!path || !gm.FS) return false;
  const dir = path.slice(0, path.lastIndexOf('/')) || '/';
  try {
    if (gm.FS.mkdirTree) gm.FS.mkdirTree(dir);
  } catch { /* already exists */ }
  gm.FS.writeFile(path, bytes);
  gm.loadSaveFiles();
  return true;
}

// Pull the newer of (this device, the cloud) into the running core. Only ever
// overwrites when the cloud copy is strictly newer, so a fresh device gets your
// progress and a device you've been playing on doesn't lose it.
async function restoreMemoryCard() {
  const gm = state.gm;
  if (!gm) return;

  const local = await Library.getCard(state.discId);
  const cloudMeta = state.cloud[state.discId];
  const cloudAt = cloudMeta?.cardUpdatedAt || 0;
  const localAt = local?.updatedAt || 0;

  let bytes = null;
  let source = null;

  if (Store.signedIn() && cloudAt > localAt) {
    try {
      bytes = await Store.downloadCard(state.discId);
      source = 'cloud';
    } catch (e) {
      console.warn('[psx] card download failed:', e.message);
    }
  }
  if (!bytes && local) {
    bytes = await toBytes(local.data);
    source = 'device';
  }
  if (!bytes) return;

  try {
    if (writeSaveFileInto(gm, bytes) && source === 'cloud') {
      await Library.putCard(state.discId, bytes);
      toast('Memory card restored from your cloud save.');
    }
  } catch (e) {
    console.warn('[psx] card restore failed:', e.message);
    toast('Could not restore the memory card into this core.', 'warn');
  }
}

async function persistMemoryCard(announce) {
  const gm = state.gm;
  if (!gm?.getSaveFile) return;
  let bytes;
  try {
    bytes = await toBytes(gm.getSaveFile(true));
  } catch (e) {
    console.warn('[psx] card read failed:', e.message);
    return;
  }
  if (!bytes || !bytes.byteLength) return;

  const previous = await Library.getCard(state.discId);
  if (previous && previous.size === bytes.byteLength && previous.updatedAt > Date.now() - 5000) return;

  await Library.putCard(state.discId, bytes);
  if (Store.signedIn()) {
    try {
      await Store.uploadCard(state.discId, bytes);
      if (announce) toast('Memory card synced.');
    } catch (e) {
      console.warn('[psx] card upload failed:', e.message);
      if (announce) toast(`Memory card saved on this device only: ${e.message}`, 'warn', 5000);
    }
  } else if (announce) {
    toast('Memory card saved on this device.');
  }
}

/* ── Save states ───────────────────────────────────────────────────────── */

function renderSlots() {
  const host = $('#slots');
  if (!host) return;
  host.textContent = '';

  const cloudStates = state.cloud[state.discId]?.states || {};

  for (const slot of CFG.save_slots) {
    const row = el('div', { class: 'slot', id: `slot-${slot}` },
      el('div', { class: 'slot-info' },
        el('strong', {}, `Slot ${slot}`),
        el('span', { class: 'muted tiny slot-when' }, 'empty'),
      ),
      el('div', { class: 'slot-actions' },
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => saveToSlot(slot) }, 'Save'),
        el('button', { class: 'btn btn-ghost btn-sm slot-load', onclick: () => loadFromSlot(slot) }, 'Load'),
      ),
    );
    host.appendChild(row);
    describeSlot(slot, cloudStates[slot]);
  }

  $('#saves-note').textContent = Store.offline
    ? 'Cloud sync is offline. Save states are still written to this device.'
    : Store.signedIn()
      ? 'Save states sync to your account. Add the same disc on another device to pick them up.'
      : 'Sign in from the library to sync these save states across devices.';
}

async function describeSlot(slot, cloudState) {
  const row = $(`#slot-${slot}`);
  if (!row) return;
  const local = await Library.getState(state.discId, slot);
  const when = row.querySelector('.slot-when');
  const loadBtn = row.querySelector('.slot-load');

  const localAt = local?.updatedAt || 0;
  const cloudAt = cloudState?.updatedAt || 0;
  const newest = Math.max(localAt, cloudAt);

  if (!newest) {
    when.textContent = 'empty';
    loadBtn.disabled = true;
    row.classList.remove('has-state');
    return;
  }
  row.classList.add('has-state');
  loadBtn.disabled = false;
  const mark = cloudAt > localAt ? ' ☁' : (cloudAt ? ' · synced' : '');
  when.textContent = `${fmtAgo(newest)}${mark}`;
}

async function saveToSlot(slot) {
  const gm = state.gm;
  if (!gm?.getState) return toast('The core is still starting up.', 'warn');

  let bytes;
  try {
    bytes = await toBytes(gm.getState());
  } catch (e) {
    return toast(`Could not read a save state: ${e.message}`, 'error', 5000);
  }
  if (!bytes || !bytes.byteLength) return toast('This core did not return a save state.', 'error');

  let shot = null;
  try { shot = await toBytes(await gm.screenshot()); } catch { /* screenshots are a nicety */ }

  await Library.putState(state.discId, slot, bytes, shot ? new Blob([shot], { type: 'image/png' }) : null);
  toast(`Saved to slot ${slot}.`);

  if (Store.signedIn()) {
    try {
      await Store.uploadState(state.discId, slot, bytes, shot, {
        title: state.disc.title, fileName: state.disc.fileName, size: state.disc.size,
      });
      state.cloud[state.discId] = state.cloud[state.discId] || {};
      state.cloud[state.discId].states = {
        ...(state.cloud[state.discId].states || {}),
        [slot]: { updatedAt: Date.now(), size: bytes.byteLength },
      };
    } catch (e) {
      toast(`Slot ${slot} saved on this device only: ${e.message}`, 'warn', 6000);
    }
  }
  describeSlot(slot, state.cloud[state.discId]?.states?.[slot]);
}

async function loadFromSlot(slot) {
  const gm = state.gm;
  if (!gm?.loadState) return toast('The core is still starting up.', 'warn');

  const local = await Library.getState(state.discId, slot);
  const cloudState = state.cloud[state.discId]?.states?.[slot];
  const localAt = local?.updatedAt || 0;
  const cloudAt = cloudState?.updatedAt || 0;

  let bytes = null;
  if (Store.signedIn() && cloudAt > localAt) {
    try {
      bytes = await Store.downloadState(state.discId, slot);
      await Library.putState(state.discId, slot, bytes, null);
    } catch (e) {
      console.warn('[psx] state download failed:', e.message);
    }
  }
  if (!bytes && local) bytes = await toBytes(local.data);
  if (!bytes) return toast(`Slot ${slot} is empty.`, 'warn');

  try {
    gm.loadState(bytes);
    toast(`Loaded slot ${slot}.`);
  } catch (e) {
    toast(`Could not load slot ${slot}: ${e.message}`, 'error', 5000);
  }
}

/* ── Player chrome ─────────────────────────────────────────────────────── */

function wirePlayer() {
  $('#btn-back').addEventListener('click', async () => {
    await leaveGame();
    navigate('#/');
  });

  const panel = $('#saves-panel');
  $('#btn-saves').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderSlots();
  });
  $('#btn-saves-close').addEventListener('click', () => { panel.hidden = true; });

  $('#btn-fullscreen').addEventListener('click', () => {
    const host = $('#view-player');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else host.requestFullscreen?.().catch(() => toast('Fullscreen was blocked by the browser.', 'warn'));
  });

  // Checkpoint whenever the tab is backgrounded — on mobile that is usually the
  // last moment we get before the page is frozen or discarded.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.discId) {
      flushPlaytime();
      persistMemoryCard(false);
    } else if (!document.hidden && state.discId) {
      state.playStartedAt = Date.now();
    }
  });
  window.addEventListener('pagehide', () => { if (state.discId) flushPlaytime(); });
}

function flushPlaytime() {
  if (!state.playStartedAt) return;
  const delta = Date.now() - state.playStartedAt;
  state.playStartedAt = 0;
  if (delta < 5000) return;
  const total = (state.disc.playMs || 0) + delta;
  state.disc.playMs = total;
  Library.patchGame(state.discId, { playMs: total, lastPlayedAt: Date.now() });
  if (Store.signedIn()) {
    Store.putGame(state.discId, { playMs: total, lastPlayedAt: Date.now() })
      .catch(e => console.warn('[psx] playtime sync:', e.message));
  }
}

async function leaveGame() {
  clearInterval(state.cardTimer);
  flushPlaytime();
  await persistMemoryCard(false);
}

/* ── Boot ──────────────────────────────────────────────────────────────── */

async function main() {
  // The library is on-device and always resolves. Cloud sync is allowed to be
  // missing entirely — store.js publishes a degraded stand-in when the SDK
  // won't load, and this backstop covers store.js itself failing to load.
  const storeFallback = new Promise(resolve => setTimeout(() => resolve({
    offline: true,
    reason: 'Cloud sync did not load.',
    currentUser: () => null,
    signedIn: () => false,
    onAuth(cb) { cb(null); return () => {}; },
    signInGoogle: async () => { throw new Error('Cloud sync did not load.'); },
    signOut: async () => {},
    listGames: async () => ({}),
    putGame: async () => {},
    deleteGame: async () => {},
    uploadState: async () => { throw new Error('Cloud sync did not load.'); },
    downloadState: async () => { throw new Error('Cloud sync did not load.'); },
    downloadShot: async () => null,
    deleteState: async () => {},
    uploadCard: async () => { throw new Error('Cloud sync did not load.'); },
    downloadCard: async () => null,
  }), 10000));

  Library = await window.LibraryReady;
  Store = await Promise.race([window.StoreReady, storeFallback]);

  wireAuth();
  wirePlayer();

  const route = parseRoute();
  if (route.view === 'play') {
    await bootPlayer(route.discId);
  } else {
    wireDropzone();
    $('#btn-settings').addEventListener('click', openSettings);
    await refreshLibrary();
  }

  // Back/forward between the two views has to reload for the same reason
  // navigate() does; on the library side it's a plain re-render.
  window.addEventListener('hashchange', () => {
    const next = parseRoute();
    if (state.discId || next.view === 'play') location.reload();
  });
}

main().catch(e => {
  console.error('[psx] failed to start', e);
  document.body.appendChild(el('p', { class: 'boot-error' }, `PSX Station failed to start: ${e.message}`));
});
