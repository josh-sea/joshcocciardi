// Local disc library for PSX Station.
//
// Discs are big (a compressed PS1 game runs 100-700MB), so they stay on the
// device in IndexedDB and are never uploaded. IndexedDB stores Blobs on disk
// rather than in the JS heap, so a library can comfortably outgrow RAM.
//
// Loaded as a <script type="module">; exposes window.Library and resolves
// window.LibraryReady (created inline in index.html before any script runs).

const DB_NAME = 'psx-station';
const DB_VERSION = 1;

const STORE_GAMES = 'games';   // { id, fileName, title, size, addedAt, lastPlayedAt, playMs, blob }
const STORE_BIOS = 'bios';     // { id: 'default', fileName, size, blob }
const STORE_STATES = 'states'; // { key: `${gameId}:${slot}`, gameId, slot, updatedAt, size, data, shot }
const STORE_CARDS = 'cards';   // { gameId, updatedAt, size, data }  — memory card (SRAM)

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_GAMES)) {
        db.createObjectStore(STORE_GAMES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BIOS)) {
        db.createObjectStore(STORE_BIOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STATES)) {
        const states = db.createObjectStore(STORE_STATES, { keyPath: 'key' });
        states.createIndex('gameId', 'gameId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        db.createObjectStore(STORE_CARDS, { keyPath: 'gameId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

// Promisify one transaction. `fn` receives the object store and may return an
// IDBRequest whose result becomes the resolved value.
async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let out;
    const req = fn(store);
    if (req instanceof IDBRequest) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/* ── Disc fingerprint ──────────────────────────────────────────────────────
   The library is local, but save states sync to the cloud, so a game needs an
   id that is stable across devices without re-reading the whole file. Hashing
   the size plus the first and last megabyte is fast (milliseconds, regardless
   of disc size) and is effectively unique for real disc images.               */
export async function fingerprint(file) {
  const CHUNK = 1024 * 1024;
  const head = new Uint8Array(await file.slice(0, Math.min(CHUNK, file.size)).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - CHUNK)).arrayBuffer());
  const meta = new TextEncoder().encode(String(file.size));
  const buf = new Uint8Array(meta.length + head.length + tail.length);
  buf.set(meta, 0);
  buf.set(head, meta.length);
  buf.set(tail, meta.length + head.length);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Best-effort human title from a filename: drop the extension and the release
// tags dumpers leave behind, but keep "(Disc 2)" — that one you need to see.
export function titleFromFileName(name) {
  let t = String(name).replace(/\.[^.]+$/, '');
  t = t.replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(/\((?!\s*(disc|disk|cd)\b)[^)]*\)/gi, ' ');
  t = t.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || String(name);
}

const Library = {
  /* ── Games ─────────────────────────────────────────────────────────────── */

  async listGames() {
    const rows = await tx(STORE_GAMES, 'readonly', s => s.getAll());
    // Blobs stay attached here; callers that only render metadata shouldn't
    // hold onto the row longer than the render.
    return (rows || []).sort((a, b) => (b.lastPlayedAt || b.addedAt || 0) - (a.lastPlayedAt || a.addedAt || 0));
  },

  async getGame(id) {
    return tx(STORE_GAMES, 'readonly', s => s.get(id));
  },

  // Adds a disc, or refreshes the blob of one already in the library (which is
  // how re-adding the same disc on a second device relinks it to cloud saves).
  async addGame(file) {
    const id = await fingerprint(file);
    const existing = await this.getGame(id);
    const row = {
      id,
      fileName: file.name,
      title: existing?.title || titleFromFileName(file.name),
      size: file.size,
      addedAt: existing?.addedAt || Date.now(),
      lastPlayedAt: existing?.lastPlayedAt || 0,
      playMs: existing?.playMs || 0,
      blob: file,
    };
    await tx(STORE_GAMES, 'readwrite', s => s.put(row));
    return { row, wasExisting: !!existing };
  },

  // Writes only the given fields, leaving the disc blob untouched.
  async patchGame(id, patch) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_GAMES, 'readwrite');
      const store = t.objectStore(STORE_GAMES);
      const get = store.get(id);
      get.onsuccess = () => {
        if (!get.result) return; // deleted mid-flight; nothing to patch
        store.put({ ...get.result, ...patch });
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async deleteGame(id) {
    await tx(STORE_GAMES, 'readwrite', s => s.delete(id));
    await this.deleteStatesFor(id);
    await tx(STORE_CARDS, 'readwrite', s => s.delete(id));
  },

  /* ── BIOS ──────────────────────────────────────────────────────────────
     Kept on-device only, never synced. pcsx_rearmed plays fine without one;
     mednafen_psx_hw refuses to start until you add yours.                    */

  async getBios() {
    return tx(STORE_BIOS, 'readonly', s => s.get('default'));
  },

  async setBios(file) {
    const row = { id: 'default', fileName: file.name, size: file.size, blob: file };
    await tx(STORE_BIOS, 'readwrite', s => s.put(row));
    return row;
  },

  async clearBios() {
    return tx(STORE_BIOS, 'readwrite', s => s.delete('default'));
  },

  /* ── Save states ───────────────────────────────────────────────────────── */

  stateKey(gameId, slot) { return `${gameId}:${slot}`; },

  async getState(gameId, slot) {
    return tx(STORE_STATES, 'readonly', s => s.get(this.stateKey(gameId, slot)));
  },

  async putState(gameId, slot, data, shot) {
    const row = {
      key: this.stateKey(gameId, slot),
      gameId,
      slot,
      updatedAt: Date.now(),
      size: data.byteLength ?? data.size ?? 0,
      data,
      shot: shot || null,
    };
    await tx(STORE_STATES, 'readwrite', s => s.put(row));
    return row;
  },

  async listStates(gameId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_STATES, 'readonly');
      const req = t.objectStore(STORE_STATES).index('gameId').getAll(gameId);
      req.onsuccess = () => resolve(req.result || []);
      t.onerror = () => reject(t.error);
    });
  },

  async deleteState(gameId, slot) {
    return tx(STORE_STATES, 'readwrite', s => s.delete(this.stateKey(gameId, slot)));
  },

  async deleteStatesFor(gameId) {
    const rows = await this.listStates(gameId);
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_STATES, 'readwrite');
      const store = t.objectStore(STORE_STATES);
      rows.forEach(r => store.delete(r.key));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  /* ── Memory card (SRAM) ────────────────────────────────────────────────── */

  async getCard(gameId) {
    return tx(STORE_CARDS, 'readonly', s => s.get(gameId));
  },

  async putCard(gameId, data) {
    const row = { gameId, updatedAt: Date.now(), size: data.byteLength ?? data.size ?? 0, data };
    await tx(STORE_CARDS, 'readwrite', s => s.put(row));
    return row;
  },

  /* ── Device storage ────────────────────────────────────────────────────── */

  // Ask the browser not to evict the library under storage pressure. Chrome
  // grants this silently for installed/frequently-visited sites; Firefox
  // prompts. A refusal isn't fatal, it just means a big library may be dropped.
  async requestPersistence() {
    if (!navigator.storage?.persist) return false;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch { return false; }
  },

  async estimate() {
    if (!navigator.storage?.estimate) return null;
    try { return await navigator.storage.estimate(); } catch { return null; }
  },
};

window.Library = Library;
if (window._libraryReadyResolve) window._libraryReadyResolve(Library);
