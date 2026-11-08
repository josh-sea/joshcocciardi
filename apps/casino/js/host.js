/* Runs the table. At a practice table that is your own phone against a
 * local "room" (no network at all); at a table with friends it is the
 * host's phone, writing to the Realtime Database.
 *
 * `room` needs writeGame(pub) and writeVault(vault). `players()` returns
 * who is online now as [{ uid }], `now()` the clock everyone shares.
 */
import * as bj from './blackjack.js';

const clone = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class Host {
  constructor(room, { players, now, rand = Math.random, hostUid = null }) {
    this.room = room;
    this.players = players;
    this.now = now;
    this.rand = rand;
    this.hostUid = hostUid;
    this.world = null;
    this.written = { pub: null, vault: null };
  }

  ctx() { return { now: this.now(), rand: this.rand, players: this.players(), hostUid: this.hostUid }; }

  start(opts) {
    this.written = { pub: null, vault: null };
    this.world = bj.start(this.players(), opts, this.ctx());
    return this.flush();
  }

  /* Picking a table back up: a new host after the old one dropped out, or
   * a practice table after a reload.
   */
  resume(pub, vault) {
    if (!pub || pub.game !== 'blackjack') { this.world = null; return false; }
    this.world = { pub: clone(pub), vault: clone(vault) || {}, fx: [] };
    bj.normalise(this.world.pub);
    this.written = { pub: clone(pub), vault: clone(vault) };
    return true;
  }

  act(uid, msg) {
    if (!this.world) return Promise.resolve();
    this.world = bj.act(clone(this.world), uid, msg, this.ctx());
    return this.flush();
  }

  tick() {
    if (!this.world) return Promise.resolve();
    this.world = bj.tick(clone(this.world), this.ctx());
    return this.flush();
  }

  flush() {
    const w = this.world, jobs = [];
    w.fx = [];
    // The vault first, so a new host never finds a table without its shoe.
    if (!same(w.vault, this.written.vault)) { jobs.push(this.room.writeVault(w.vault)); this.written.vault = clone(w.vault); }
    if (!same(w.pub, this.written.pub)) { jobs.push(this.room.writeGame(w.pub)); this.written.pub = clone(w.pub); }
    return Promise.all(jobs);
  }
}
