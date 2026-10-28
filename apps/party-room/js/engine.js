/* The host's side of every game, and the one place that knows how a game's
 * state is split between the room, the vault and each player's secret.
 *
 * A game is three pure functions: start, act (a player did something) and
 * tick (time passed). They all take and return a "world":
 *
 *   { pub, vault, secret: { [uid]: value | null }, fx: [...] }
 *
 * `pub` goes to the room for everyone, `vault` to the host-only node, each
 * secret to its owner, and `fx` is a list of one-off side effects (clear the
 * drawing, send someone a private note) for the host to carry out.
 *
 * `Host` below is what actually runs on the host's phone. It knows nothing
 * about Firebase beyond the handful of writes the room object offers, so it
 * runs against a fake room in node.
 */
import * as trivia from './trivia.js';
import * as sketch from './sketch.js';
import * as chips from './chips.js';
import * as forehead from './forehead.js';
import { obj, arr } from './room.js';

export const ENGINES = { trivia, sketch, chips, forehead };

const clone = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const norm = (w) => ({ pub: w.pub, vault: w.vault || {}, secret: obj(w.secret), fx: arr(w.fx) });

export function startWorld(id, players, opts, ctx) {
  return norm(ENGINES[id].start(players, opts || {}, ctx));
}

export function actWorld(world, uid, msg, ctx) {
  const e = world && world.pub && ENGINES[world.pub.game];
  if (!e || world.pub.phase === 'over') return world;
  return norm(e.act(clone(world), uid, msg, ctx));
}

export function tickWorld(world, ctx) {
  const e = world && world.pub && ENGINES[world.pub.game];
  if (!e || world.pub.phase === 'over') return world;
  return norm(e.tick(clone(world), ctx));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* The host loop. `room` needs writeGame, writeVault, writeSecret, writeNote,
 * clearStrokes and endGame; `players()` returns who is online right now and
 * `now()` the server's clock.
 */
export class Host {
  constructor(room, { players, now, rand = Math.random }) {
    this.room = room;
    this.players = players;
    this.now = now;
    this.rand = rand;
    this.world = null;
    this.written = { pub: null, vault: null, secret: {} };
  }

  ctx() { return { now: this.now(), rand: this.rand, players: this.players() }; }

  start(id, opts) {
    this.written = { pub: null, vault: null, secret: {} };
    this.world = startWorld(id, this.players(), opts, this.ctx());
    this.world.pub.opts = opts || {};
    return this.flush();
  }

  /* Taking over from a host whose phone dropped out: the room has the
   * public state and the vault has the rest. Secrets are rewritten from the
   * vault as the game goes, so nothing is lost but a moment.
   */
  resume(pub, vault) {
    if (!pub || !ENGINES[pub.game]) { this.world = null; return; }
    this.world = { pub, vault: vault || {}, secret: {}, fx: [] };
    this.written = { pub, vault, secret: {} };
  }

  act(uid, msg) {
    if (!this.world) return Promise.resolve();
    this.world = actWorld(this.world, uid, msg, this.ctx());
    return this.flush();
  }

  tick() {
    if (!this.world) return Promise.resolve();
    this.world = tickWorld(this.world, this.ctx());
    return this.flush();
  }

  stop() {
    this.world = null;
    this.written = { pub: null, vault: null, secret: {} };
    return this.room.endGame();
  }

  flush() {
    const w = this.world, jobs = [];
    for (const fx of w.fx) {
      if (fx.type === 'clear-strokes') jobs.push(this.room.clearStrokes());
      else if (fx.type === 'note') jobs.push(this.room.writeNote(fx.uid, fx.text));
    }
    w.fx = [];
    if (!same(w.vault, this.written.vault)) { jobs.push(this.room.writeVault(w.vault)); this.written.vault = clone(w.vault); }
    for (const [uid, v] of Object.entries(w.secret)) {
      if (!same(v, this.written.secret[uid])) {
        jobs.push(this.room.writeSecret(uid, v));
        this.written.secret[uid] = clone(v);
      }
    }
    // The room last, so a phone never sees a phase before its secret.
    if (!same(w.pub, this.written.pub)) { jobs.push(this.room.writeGame(w.pub)); this.written.pub = clone(w.pub); }
    return Promise.all(jobs);
  }
}
