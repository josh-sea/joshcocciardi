/* Who is in the lobby, as pure functions over the room's `players` map:
 *   { [uid]: { names: ['Josh', 'Dan'], joined, online, leftAt } }
 * One browser can bring more than one marine (a shared keyboard, gamepads),
 * so seats are counted in marines, not browsers.
 */

import { MAX_BODIES } from './config.js';

export const list = players => Object.entries(players || {}).map(([uid, p]) => ({ uid, ...p }))
  .sort((a, b) => (a.joined || 0) - (b.joined || 0) || (a.uid < b.uid ? -1 : 1));

export const namesOf = p => (Array.isArray(p && p.names) ? p.names : Object.values((p && p.names) || {})).filter(Boolean);

// Every marine in the room: [{ pid, uid, name }], oldest browser first.
export function bodies(players) {
  const out = [];
  for (const p of list(players)) namesOf(p).forEach((name, i) => out.push({ pid: `${p.uid}_${i}`, uid: p.uid, name, online: p.online !== false, out: !!p.out }));
  return out;
}

// Seats a newcomer (or a returning browser with a new head count) can take.
// Offline browsers' seats are freed if that's what it takes to fit.
export const STALE_MS = 5 * 60 * 1000;

// The marines that should be in the match right now.
export const inMatch = players => bodies(players).filter(b => b.online && !b.out);

export function seat(players, uid, names, now = Date.now(), staleMs = STALE_MS) {
  const next = JSON.parse(JSON.stringify(players || {}));
  for (const [id, p] of Object.entries(next)) if (id !== uid && !p.online && p.leftAt != null && now - p.leftAt > staleMs) delete next[id];
  const others = () => list(next).filter(p => p.uid !== uid).reduce((n, p) => n + namesOf(p).length, 0);
  while (others() + names.length > MAX_BODIES) {
    const off = list(next).find(p => p.uid !== uid && !p.online);
    if (!off) return null;
    delete next[off.uid];
  }
  next[uid] = { ...(next[uid] || {}), names, joined: (next[uid] && next[uid].joined) || now, online: true };
  delete next[uid].leftAt;
  delete next[uid].out;
  return next;
}

// Who runs the simulation: the current host while online, otherwise the
// longest-standing online browser.
export function pickHost(players, current) {
  const ps = list(players);
  const cur = ps.find(p => p.uid === current);
  if (cur && cur.online) return current;
  const on = ps.filter(p => p.online);
  return on.length ? on[0].uid : current;
}

export function cleanName(raw) {
  return String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18).trim();
}
