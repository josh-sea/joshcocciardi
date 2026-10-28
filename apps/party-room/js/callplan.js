/* Who is on the video call, and who connects to whom. Pure: no DOM, no
 * Firebase, no WebRTC, so it runs in node.
 *
 * Video goes phone to phone. Every phone on the call sends its video to
 * every other one, which is free but means the work grows with the number
 * of people: six phones each send five streams, and that is about where
 * phones start to struggle. So the call takes the first six who turn
 * video on, and anyone after that is told it's full.
 */
import { obj } from './room.js';

export const CAP = 6;

/* Low quality on purpose: a tile is small, and every phone sends one of
 * these to everybody else.
 */
export const VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 }, facingMode: 'user' };
export const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
export const MAX_BITRATE = 250000;

/* Free public STUN only. No TURN relay: a pair of phones that can't reach
 * each other directly (some cellular carriers, strict work Wi-Fi) shows
 * "video unavailable" for that pair instead.
 */
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/* The call, in the order people turned their video on, capped. Someone
 * whose phone has dropped out of the room is not on it.
 */
export function onCall(media, players, cap = CAP) {
  const p = obj(players);
  return Object.entries(obj(media))
    .filter(([uid, m]) => m && m.on && m.sid && p[uid] && p[uid].online)
    .sort((a, b) => (a[1].since || 0) - (b[1].since || 0) || (a[0] < b[0] ? -1 : 1))
    .slice(0, cap)
    .map(([uid]) => uid);
}

export function isFull(media, players, me, cap = CAP) {
  const on = onCall(media, players, cap);
  return on.length >= cap && !on.includes(me);
}

/* Exactly one side of each pair makes the offer, so two phones never
 * both call each other at once. Which one doesn't matter, only that both
 * agree, so it is whoever's id sorts first.
 */
export const offers = (me, other) => me < other;

/* What has to change: connect to anyone on the call we have no live
 * connection with (or whose phone reloaded, which gives it a new session
 * id), and hang up on anyone who has left it.
 *
 * `peers` is { [uid]: remoteSid } for the connections this phone holds.
 */
export function plan(me, media, players, peers, cap = CAP) {
  const call = onCall(media, players, cap);
  if (!call.includes(me)) return { connect: [], drop: Object.keys(obj(peers)) };
  const m = obj(media), have = obj(peers);
  const wanted = call.filter((u) => u !== me);
  const connect = wanted.filter((u) => have[u] !== m[u].sid);
  const drop = Object.keys(have).filter((u) => !wanted.includes(u) || have[u] !== m[u].sid);
  return { connect, drop };
}

/* A setup message is for this session only. One left over from before a
 * reload, ours or theirs, is ignored rather than wiring up a dead call.
 */
export function forMe(msg, mySid) {
  return !!msg && msg.to === mySid && ['offer', 'answer', 'ice'].includes(msg.t) && typeof msg.d === 'string';
}

export function newSid(rand = Math.random) {
  return Math.floor(rand() * 2 ** 32).toString(36) + Math.floor(rand() * 2 ** 32).toString(36);
}
