/* Seat rules for the lobby. Pure functions over the room's `players` map
 * ({ [uid]: { name, role, joined, online } }), run inside database
 * transactions so two people tapping at once can't both land in a seat.
 */

import { MAX_SPEARS } from './config.js';

export const list = players => Object.entries(players || {}).map(([uid, p]) => ({ uid, ...p }));
export const tophatOf = players => list(players).find(p => p.role === 'tophat') || null;
export const spearsOf = players => list(players).filter(p => p.role === 'spear').sort((a, b) => (a.joined || 0) - (b.joined || 0));

/* Where a newcomer sits. Spears fill first; once all four Spear seats are
 * taken the next person gets the Tophat seat. A seat whose holder has gone
 * offline still counts as taken, so a dropped friend can come back to it,
 * unless the room is otherwise full, in which case the newcomer takes it.
 */
export function seatFor(players, uid) {
  const me = players && players[uid];
  if (me && me.role) return { role: me.role, replace: null };
  const spears = spearsOf(players), top = tophatOf(players);
  if (spears.length < MAX_SPEARS) return { role: 'spear', replace: null };
  if (!top) return { role: 'tophat', replace: null };
  const offSpear = spears.find(p => !p.online);
  if (offSpear) return { role: 'spear', replace: offSpear.uid };
  if (!top.online) return { role: 'tophat', replace: top.uid };
  return { role: null, replace: null };
}

/* Tapping the Tophat seat: take it if it's empty or its holder is offline,
 * otherwise the current Tophat has to say yes.
 */
export function tophatAction(players, uid) {
  const top = tophatOf(players);
  if (top && top.uid === uid) return 'already';
  if (!top || !top.online) return 'take';
  return 'ask';
}

// Tophat → Spear needs a free Spear seat (or an offline one to take over).
export function canBeSpear(players, uid) {
  const spears = spearsOf(players).filter(p => p.uid !== uid);
  return spears.length < MAX_SPEARS || spears.some(p => !p.online);
}

/* Apply a role change to a copy of `players`. Used by transactions.
 * 'take-tophat': uid takes the Tophat seat; whoever held it (offline) is
 *   moved to Spear if there's room, otherwise dropped.
 * 'swap': uid (requester) and the current Tophat trade seats.
 * 'be-spear': the Tophat moves to a Spear seat, leaving Tophat empty.
 */
export function applyRole(players, uid, action) {
  const next = JSON.parse(JSON.stringify(players || {}));
  const me = next[uid]; if (!me) return null;
  const top = tophatOf(next);
  if (action === 'take-tophat') {
    if (top && top.uid !== uid) {
      if (top.online) return null;
      const room = spearsOf(next).filter(p => p.uid !== uid).length < MAX_SPEARS || me.role === 'spear';
      if (room) next[top.uid].role = 'spear'; else delete next[top.uid];
    }
    me.role = 'tophat';
    return next;
  }
  if (action === 'swap') {
    if (!top || top.uid === uid) return null;
    next[top.uid].role = me.role || 'spear';
    me.role = 'tophat';
    return next;
  }
  if (action === 'be-spear') {
    if (me.role !== 'tophat') return null;
    if (!canBeSpear(next, uid)) return null;
    const spears = spearsOf(next).filter(p => p.uid !== uid);
    if (spears.length >= MAX_SPEARS) { const off = spears.find(p => !p.online); if (off) delete next[off.uid]; }
    me.role = 'spear';
    return next;
  }
  return null;
}

/* Who runs the simulation. The current host keeps it while online;
 * otherwise the longest-standing online player takes over.
 */
export function pickHost(players, current) {
  const ps = list(players);
  const cur = ps.find(p => p.uid === current);
  if (cur && cur.online) return current;
  const on = ps.filter(p => p.online).sort((a, b) => (a.joined || 0) - (b.joined || 0) || (a.uid < b.uid ? -1 : 1));
  return on.length ? on[0].uid : current;
}

export function cleanName(raw) {
  return String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18).trim();
}
