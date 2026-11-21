/* Whistle Rig: saved takes in IndexedDB (this browser only). */

const DB = 'whistle-rig', STORE = 'takes';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const saveTake = (take) => tx('readwrite', (s) => s.put(take));
export const getTake = (id) => tx('readonly', (s) => s.get(id));
export const deleteTake = (id) => tx('readwrite', (s) => s.delete(id));

// The list without the audio, so it stays quick.
export async function listTakes() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out.sort((a, b) => b.created - a.created));
      const { id, name, created, duration, backingName } = c.value;
      out.push({ id, name, created, duration, backingName });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
