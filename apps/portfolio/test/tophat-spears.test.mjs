/* Tophat & Spears: the match rules and lobby seats, tested without a browser.
 *
 * The simulation and the seat logic are pure modules shared by every
 * player's browser, so the things players would notice going wrong (the
 * death timer, the leash, hop checks, who gets which seat, a snapshot that
 * doesn't survive the trip through the database) are all checkable here.
 *
 * Run: node apps/portfolio/test/tophat-spears.test.mjs
 */
import { DEFAULTS, cleanConfig, MAX_SLOPE } from '../../tophat-spears/js/config.js';
import { H, PROPS, losClear, seeded } from '../../tophat-spears/js/map.js';
import {
  setRandom, waveComposition, deathWait, leashStatus, rankBodies, moveSpear,
  newMatch, step, addSpear, removeSpear, setDriven, hop, redeploy, spearPose, spearShot, order,
  snapshot, decode, interpolate, serialize, restore,
} from '../../tophat-spears/js/sim.js';
import { seatFor, tophatAction, applyRole, pickHost, canBeSpear, cleanName } from '../../tophat-spears/js/lobby.js';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); failures++; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
setRandom(seeded(7));

console.log('\nconfig');
{
  ok('defaults survive cleaning', JSON.stringify(cleanConfig(DEFAULTS)) === JSON.stringify(DEFAULTS));
  const c = cleanConfig({ hopCd: 9999, heroHp: -3, leashR: 'x' });
  ok('values are clamped to the slider range', c.hopCd === 45 && c.heroHp === 0 && c.leashR === DEFAULTS.leashR);
}

console.log('\nmap');
{
  ok('the map is the same every time', PROPS.rocks.length > 20 && PROPS.obstacles.length === PROPS.rocks.length + PROPS.spires.length + 1);
  ok('the ridge blocks sight from south to north', !losClear(0, H(0, 20) + 1.6, 20, 0, H(0, -20) + 1.2, -20));
  ok('open ground near the relay is clear', losClear(-6, H(-6, 46) + 1.6, 46, 6, H(6, 46) + 1.2, 46));
}

console.log('\nrules');
{
  ok('wave 1 is 12 lings, no brutes', JSON.stringify(waveComposition(1)) === '{"lings":12,"brutes":0}');
  ok('the last wave brings 2 extra brutes', waveComposition(6).brutes === 6);
  const C = { ...DEFAULTS };
  ok('normal death waits the respawn time', deathWait(C, 100, 90).wait === C.respawn);
  const early = deathWait(C, 100, 115);
  ok('early death waits out the hop cooldown', early.wait === 15 && /cooldown/.test(early.reason));
  const L = { kind: 'point', x: 0, z: 0, deadline: 10 };
  ok('inside the zone is ok', leashStatus({ x: 3, z: 0 }, L, C, 20).s === 'ok');
  ok('outside before the deadline is go', leashStatus({ x: 30, z: 0 }, L, C, 5).s === 'go');
  ok('outside after the deadline is bad', leashStatus({ x: 30, z: 0 }, L, C, 11).s === 'bad');
  const P = { kind: 'patrol', ax: 0, az: 0, bx: 40, bz: 0, deadline: 10 };
  ok('patrol zone measures to the segment', near(leashStatus({ x: 20, z: 5 }, P, C, 11).d, 5));

  const units = [
    { id: 1, team: 'm', x: 0, z: 0, hp: 100, order: { type: 'hold' } },
    { id: 2, team: 'm', x: 50, z: 50, hp: 100, order: { type: 'move' } },
    { id: 3, team: 'm', x: 51, z: 51, hp: 100, order: { type: 'hold' }, owner: 'abc' },
    { id: 9, team: 's', x: 2, z: 2, hp: 30 },
  ];
  const r = rankBodies(units);
  ok('bodies in combat rank first', r[0].m.id === 1 && r[0].tag === 'combat');
  ok('bodies owned by a Spear are not offered', !r.some(x => x.m.id === 3));
}

console.log('\nspear movement');
{
  const pose = { x: 0, z: 46, y: H(0, 46), vy: 0, yaw: 0 };
  moveSpear(pose, { f: 1, s: 0 }, 0.1);
  ok('forward is -z', pose.z < 46 && near(pose.x, 0, 1e-9));
  // Find a steep slope on the outer wall and walk into it.
  const wall = { x: 0, z: 72, y: H(0, 72), vy: 0, yaw: Math.PI };
  const slope = (H(0, 73.6) - H(0, 73.4)) / 0.2;
  for (let i = 0; i < 40; i++) moveSpear(wall, { f: 1, s: 0 }, 0.05);
  ok('the outer wall is steeper than the limit', slope > MAX_SLOPE, slope.toFixed(2));
  ok('a Spear cannot walk up it to the map edge', wall.z < 73.6, wall.z.toFixed(2));
}

console.log('\nmatch');
{
  const s = newMatch(DEFAULTS);
  ok('a match starts with 12 marines', s.marines.length === 12);
  addSpear(s, 'p1', 'Ash'); addSpear(s, 'p2', 'Bo');
  const [a, b, c] = s.marines;
  ok('a new Spear can drop straight in', redeploy(s, 'p1', a.id).ok && a.owner === 'p1');
  ok('the body gets the small HP buff', near(a.maxHp, 120));
  ok('two Spears cannot share a body', !redeploy(s, 'p2', a.id).ok);
  ok('hop is refused while cooling down', /cooling/.test(hop(s, 'p1', b.id).why));
  s.now += DEFAULTS.hopCd;
  const res = hop(s, 'p1', b.id);
  ok('hop works once the cooldown is up', res.ok && b.owner === 'p1' && a.owner === '', JSON.stringify(res));
  ok('the old body is back to normal', near(a.maxHp, 100) && near(a.hp, 100));
  s.now += DEFAULTS.hopCd;
  c.x = b.x + DEFAULTS.hopRange + 10;
  ok('hop is refused out of range', /range/.test(hop(s, 'p1', c.id).why));

  // Leash: order the Spear's body somewhere far, wait past the deadline.
  order(s, 'move', [b.id], { x: -60, z: 40 });
  ok('ordering the Spear sets a leash', s.spears.p1.leash && s.events.some(e => e.to === 'p1'));
  setDriven(s, 'p1', true);
  spearPose(s, 'p1', { u: b.id, x: b.x, y: b.y, z: b.z, yaw: 0 });
  const hp0 = b.hp;
  for (let i = 0; i < 30 * 20; i++) { spearPose(s, 'p1', { u: b.id, x: b.x, y: b.y, z: b.z, yaw: 0 }); step(s, 1 / 30); }
  ok('staying out of the zone past the deadline bleeds HP', b.hp < hp0 || b.dead);

  // Death: kill the body and check the redeploy timer.
  const sp = s.spears.p1;
  b.hp = 1; sp.hopReadyAt = s.now + 30;
  for (let i = 0; i < 200 && sp.state === 'active'; i++) { spearPose(s, 'p1', { u: b.id, x: b.x, y: b.y, z: b.z, yaw: 0 }); step(s, 1 / 30); }
  ok('the Spear dies with its body', sp.state === 'dead' && sp.deaths === 1);
  ok('early death waits out the cooldown', near(sp.deadUntil - s.now, 30, 0.5), (sp.deadUntil - s.now).toFixed(2));
  ok('redeploy is refused before the timer', !redeploy(s, 'p1', c.id).ok);

  removeSpear(s, 'p2');
  ok('a Spear who leaves is removed', !s.spears.p2);
}

console.log('\nshots');
{
  const s = newMatch(DEFAULTS);
  addSpear(s, 'p1', 'Ash');
  const m = s.marines[0]; redeploy(s, 'p1', m.id);
  s.now = 13; s.bugs.push({ id: 999, team: 's', type: 'ling', x: m.x, z: m.z - 10, y: 0, hp: 30, maxHp: 30, r: 0.55, speed: 0, atkCd: 9, face: 0, dead: false, deathT: 0, wob: 0 });
  ok('a Spear shot hits the bug it names', spearShot(s, 'p1', { bug: 999, a: [m.x, 1, m.z], b: [m.x, 1, m.z - 10] }));
  ok('shots faster than the gun can fire are dropped', !spearShot(s, 'p1', { bug: 999 }));
  ok('the shot is broadcast with its shooter', s.shots.some(x => x[6] === 'p1'));
}

console.log('\nwire format');
{
  const s = newMatch(DEFAULTS);
  addSpear(s, 'p1', 'Ash'); redeploy(s, 'p1', s.marines[2].id);
  for (let i = 0; i < 30 * 15; i++) step(s, 1 / 30);
  // Simulate the trip through the database: JSON, and arrays with no nulls.
  const snap = JSON.parse(JSON.stringify(snapshot(s)));
  const v = decode(snap);
  ok('every unit survives the trip', v.units.size === s.marines.length + s.bugs.length);
  ok('spear state survives the trip', v.spears.p1.unitId === s.marines.find(m => m.owner === 'p1').id && v.spears.p1.name === 'Ash');
  ok('no nulls inside arrays', !JSON.stringify(snap.m).includes('null') && !JSON.stringify(snap.b).includes('null'));
  ok('a database-mangled array decodes too', decode({ ...snap, m: Object.assign({}, snap.m) }).units.size === v.units.size);
  const s2 = JSON.parse(JSON.stringify(snap)); s2.n += 0.1; s2.m[0][3] += 1;
  const mid = interpolate(decode(snap), decode(s2), 0.5);
  ok('interpolation lands halfway', near(mid.units.get(snap.m[0][0]).x, snap.m[0][3] + 0.5, 1e-9));
  const back = restore(JSON.parse(JSON.stringify(serialize(s))));
  for (let i = 0; i < 30; i++) step(back, 1 / 30);
  ok('a restored match keeps running', back.now > s.now && back.marines.length > 0);
}

console.log('\nlobby seats');
{
  let P = {};
  const join = (uid, t) => { const st = seatFor(P, uid); if (st.replace) delete P[st.replace]; if (st.role) P[uid] = { name: uid, role: st.role, joined: t, online: true }; return st.role; };
  ok('first four people are Spears', ['a', 'b', 'c', 'd'].map((u, i) => join(u, i)).every(r => r === 'spear'));
  ok('the fifth gets Tophat', join('e', 5) === 'tophat');
  ok('the sixth is turned away', join('f', 6) === null);
  ok('a returning player keeps their seat', seatFor(P, 'b').role === 'spear');
  ok('a Spear tapping Tophat has to ask', tophatAction(P, 'a') === 'ask');
  const sw = applyRole(P, 'a', 'swap');
  ok('a swap trades the two seats', sw.a.role === 'tophat' && sw.e.role === 'spear');
  P.e.online = false;
  ok('an offline Tophat seat can just be taken', tophatAction(P, 'a') === 'take');
  const tk = applyRole(P, 'a', 'take-tophat');
  ok('taking it moves the old Tophat to Spear', tk.a.role === 'tophat' && tk.e.role === 'spear');
  ok('Tophat cannot drop to Spear when all Spear seats are full and online', !canBeSpear({ ...P, e: { ...P.e, online: true } }, 'e'));
  ok('the host stays while online', pickHost(P, 'c') === 'c');
  P.a.online = false;
  ok('the longest-standing online player takes over', pickHost(P, 'a') === 'b');
  ok('names are cleaned', cleanName('  <b>Ash</b>   the\n great and powerful ') === 'bAsh/b the great a');
}

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
