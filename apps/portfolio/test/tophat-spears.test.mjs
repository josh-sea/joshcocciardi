/* Tophat & Spears: the match rules and lobby seats, tested without a browser.
 *
 * The simulation and the seat logic are pure modules shared by every
 * player's browser, so the things players would notice going wrong (the
 * death timer, the leash, hop checks, who gets which seat, a snapshot that
 * doesn't survive the trip through the database) are all checkable here.
 *
 * Run: node apps/portfolio/test/tophat-spears.test.mjs
 */
import { DEFAULTS, cleanConfig, MAX_SLOPE, MTYPES, STIM, SHOT, WAVES } from '../../tophat-spears/js/config.js';
import { H, PROPS, BLUFFS, BUNKERS, BKIND, losClear, route, levelAt, seeded } from '../../tophat-spears/js/map.js';
import {
  setRandom, waveComposition, waveHp, spearGarrison, deathWait, leashStatus, rankBodies, moveSpear,
  newMatch, step, addSpear, removeSpear, setDriven, hop, redeploy, spearPose, spearShot, order, stim, spearStim, weaponCycle,
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
  ok('the map is the same every time', PROPS.rocks.length > 20 && PROPS.obstacles.length === PROPS.rocks.length + PROPS.spires.length + 1 + BUNKERS.length);
  const W = BLUFFS[0], R = W.ramp;
  ok('the west bluff stands well above the field', H(-60, 10) - H(-30, 10) > 7);
  ok('its sides are cliffs', (H(-40.2, 0) - H(-38.8, 0)) / 1.4 > 3);
  ok('its ramp is gentle enough to walk', (H(R.T.x, R.zTop + 1) - H(R.B.x, R.zBot - 1)) / (R.zBot - R.zTop - 2) < MAX_SLOPE);
  // Walk a route from the swarm's side to the top of the west bluff.
  let x = -30, z = -50, steps = 0, worst = 0;
  const gx = -60, gz = 0;
  while (Math.hypot(gx - x, gz - z) > 0.6 && steps++ < 3000) {
    const [wx, wz] = route(x, z, gx, gz), d = Math.hypot(wx - x, wz - z) || 1, st = Math.min(0.25, d);
    const nx = x + (wx - x) / d * st, nz = z + (wz - z) / d * st;
    worst = Math.max(worst, (H(nx, nz) - H(x, z)) / st); x = nx; z = nz;
  }
  ok('the way up a bluff is the long way round, by the ramp', steps < 3000 && worst < MAX_SLOPE && steps * 0.25 > 100, `${steps} steps, worst rise ${worst.toFixed(2)}`);
  ok('a bluff top is its own level', levelAt(-60, 0) === 1 && levelAt(-30, 0) === 0);
  const t = BUNKERS.find(k => k.kind === 'tower'), K = BKIND.tower;
  ok('from a watchtower you can see the field below', losClear(t.x, t.base + K.floor + 1.5, t.z, t.x + 26, H(t.x + 26, t.z - 14) + 0.6, t.z - 14));
  ok('the ridge blocks sight from south to north', !losClear(0, H(0, 20) + 1.6, 20, 0, H(0, -20) + 1.2, -20));
  ok('open ground near the relay is clear', losClear(-6, H(-6, 46) + 1.6, 46, 6, H(6, 46) + 1.2, 46));
}

console.log('\nrules');
{
  const w1 = waveComposition(1);
  ok('wave 1 is lings and nothing else', w1.lings > 0 && w1.brutes === 0 && w1.spitters === 0 && w1.burrowers === 0);
  ok('spitters arrive from wave 2, burrowers from wave 3', waveComposition(2).spitters > 0 && waveComposition(2).burrowers === 0 && waveComposition(3).burrowers > 0);
  ok('every wave is bigger than the last', [...Array(WAVES - 1).keys()].every(i => { const a = waveComposition(i + 1), b = waveComposition(i + 2); return b.lings > a.lings && b.brutes >= a.brutes; }));
  ok('later waves are tougher too', waveHp(WAVES) > waveHp(1) && waveHp(1) === 1);
  ok('the last wave brings extra brutes', waveComposition(WAVES).brutes > waveComposition(WAVES - 1).brutes + 1);
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
  // Run and jump at a bluff's cliff: no climbing it mid-air either.
  const foot = { x: -37, z: 0, y: H(-37, 0), vy: 0, yaw: Math.PI / 2 };
  for (let i = 0; i < 60; i++) moveSpear(foot, { f: 1, s: 0, jump: true }, 0.05);
  ok('a Spear cannot jump up a cliff', foot.y < 3 && foot.x > -40.5, `${foot.x.toFixed(2)}, ${foot.y.toFixed(2)}`);
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
  const hpBefore = s.bugs.find(b => b.id === 999).hp;
  for (let i = 0; i < 4; i++) spearShot(s, 'p1', { bug: 999 });
  const hpAfter = s.bugs.find(b => b.id === 999).hp;
  ok('the rifle fires a whole 4-round burst at once', hpAfter < hpBefore && s.shots.filter(x => x[6] === 'p1').length === 5);
  ok('more rounds than the gun can fire are dropped', !spearShot(s, 'p1', { bug: 999 }) && !spearShot(s, 'p1', { bug: 999 }));
  s.now += 0.7;
  ok('after the pause the next burst fires', spearShot(s, 'p1', { bug: 999 }) !== undefined && s.shots.filter(x => x[6] === 'p1').length >= 6);
  ok('the shot is broadcast with its shooter', s.shots.some(x => x[6] === 'p1'));
}

console.log('\nunit types');
{
  const s = newMatch(DEFAULTS);
  const count = t => s.marines.filter(m => m.type === t).length;
  ok('squads start mixed: 7 marines, 2 torches, 2 shades, 1 strider', count('marine') === 7 && count('torch') === 2 && count('shade') === 2 && count('strider') === 1);
  const strider = s.marines.find(m => m.type === 'strider');
  ok('a strider has the most armor', strider.maxHp === MTYPES.strider.hp && strider.maxHp > 300);
  ok('a burst of 4 plus the pause is the rifle cadence', near(weaponCycle(MTYPES.marine.w, false), 3 * 0.08 + 0.45));
  ok('stim fires half again as fast', near(weaponCycle(MTYPES.marine.w, true), (3 * 0.08 + 0.45) / STIM.rate));

  // Stim
  const marine = s.marines.find(m => m.type === 'marine'), shade = s.marines.find(m => m.type === 'shade');
  const weak = s.marines.filter(m => m.type === 'marine')[1]; weak.hp = 8;
  const n = stim(s, [marine.id, shade.id, weak.id]);
  ok('stim costs a marine 10 HP', n === 1 && marine.hp === 90 && marine.stimUntil > s.now);
  ok('shades cannot stim, and nobody stims themselves to death', shade.stimUntil === 0 && weak.hp === 8);
  addSpear(s, 'p1', 'Ash'); redeploy(s, 'p1', weak.id); weak.hp = 50;
  ok('a Spear can stim their own body', spearStim(s, 'p1') === 1 && weak.stimUntil > s.now);
  ok('stimming yourself sends no alert', !s.events.some(e => e.to === 'p1' && /stimmed you/.test(e.m)));
  weak.stimUntil = 0; weak.hp = 50;
  stim(s, [weak.id]);
  ok('the Tophat can stim a Spear, and the Spear is told', weak.stimUntil > s.now && s.events.some(e => e.to === 'p1' && /stimmed you/.test(e.m)));
}
{
  // A Spear in a Torch burns every bug in the cone it names.
  const s = newMatch(DEFAULTS); s.now = 13;
  const torch = s.marines.find(m => m.type === 'torch');
  addSpear(s, 'p1', 'Bo'); redeploy(s, 'p1', torch.id);
  const bug = (id, dz) => ({ id, team: 's', type: 'ling', x: torch.x, z: torch.z - dz, y: 0, hp: 30, maxHp: 30, r: 0.55, speed: 0, atkCd: 9, face: 0, dead: false, deathT: 0, wob: 0, burrowed: false, bT: 0, uT: 0, lost: 0 });
  s.bugs.push(bug(901, 3), bug(902, 5), bug(903, 40));
  spearShot(s, 'p1', { bugs: [901, 902, 903] });
  const hp = id => s.bugs.find(b => b.id === id).hp;
  ok('flame hits every bug in reach', hp(901) < 30 && hp(902) < 30);
  ok('flame does not reach a bug 40m away', hp(903) === 30);
  ok('the flame is broadcast as a flame', s.shots.some(x => x[7] === SHOT.flame));
}
{
  // A dug-in Burrower's spike line hits soldiers on the line and misses the rest.
  const s = newMatch(DEFAULTS);
  s.marines = s.marines.slice(0, 3);
  const [onLine, behind, aside] = s.marines;
  const bx = 0, bz = 40;
  Object.assign(onLine, { x: 0, z: 48 }); Object.assign(behind, { x: 0, z: 53 }); Object.assign(aside, { x: 6, z: 49 });
  s.marines.forEach(m => { m.order = { type: 'hold', x: m.x, z: m.z }; m.hp = 1000; m.maxHp = 1000; });
  s.bugs.push({ id: 950, team: 's', type: 'burrower', x: bx, z: bz, y: H(bx, bz), hp: 9999, maxHp: 9999, r: 0.9, speed: 4, atkCd: 0, face: 0, dead: false, deathT: 0, wob: 0, burrowed: false, bT: 0, uT: 0, lost: 0 });
  s.nextWaveAt = 9999; s.reinforceAt = 9999;
  for (let i = 0; i < 30 * 3; i++) { step(s, 1 / 30); s.marines.forEach(m => { m.x = m.order.x; m.z = m.order.z; }); }
  const lurk = s.bugs.find(b => b.id === 950);
  ok('the burrower digs in once a soldier is in range', lurk.burrowed);
  ok('the spike line hits soldiers along it', onLine.hp < 1000 && behind.hp < 1000);
  ok('and misses a soldier off to the side', aside.hp === 1000);
}

console.log('\nwaves and buildings');
{
  const s = newMatch(DEFAULTS);
  s.marines.forEach(m => { m.hp = m.maxHp = 1e6; });
  let overlap = false;
  for (let i = 0; i < 30 * 90 && !overlap; i++) { step(s, 1 / 30); if (s.waveN >= 2 && s.bugs.some(b => !b.dead)) overlap = true; }
  ok('the next wave comes whether or not the last is cleared', overlap);
  const half = newMatch({ ...DEFAULTS, swarm: 0.5 }), full = newMatch(DEFAULTS);
  half.now = full.now = 15; step(half, 1 / 30); step(full, 1 / 30);
  ok('the swarm size setting scales the waves', half.queue.length + half.bugs.length < full.queue.length + full.bugs.length);
}
{
  const s = newMatch(DEFAULTS); s.nextWaveAt = s.reinforceAt = 9999;
  const k = BUNKERS[0], K = BKIND.bunker;
  const team = s.marines.filter(m => m.type !== 'strider').slice(0, 5);
  order(s, 'move', team.map(m => m.id), { x: k.x, z: k.z });
  ok('ordering a move onto a bunker means go in', team.every(m => m.order.type === 'enter' && m.order.b === 0));
  const wire = JSON.stringify(snapshot(s));
  ok('an order into a building goes over the wire cleanly', !wire.includes('null') && decode(JSON.parse(wire)).units.get(team[0].id).order.type === 'enter');
  for (let i = 0; i < 30 * 20; i++) step(s, 1 / 30);
  const inside = team.filter(m => m.inB === 0);
  ok('they walk over and fill its four slots', inside.length === K.slots.length && new Set(inside.map(m => m.slot)).size === K.slots.length);
  ok('the fifth waits outside', team.filter(m => m.inB < 0).length === 1);
  ok('the soldiers inside stand on its floor', inside.every(m => near(m.y, k.base + K.floor, 1e-6)));
  // A ling at the wall bites the bunker, not the soldiers in it.
  const hp0 = inside.map(m => m.hp);
  s.bugs.push({ id: 990, team: 's', type: 'ling', x: k.x, z: k.z - k.r - 0.8, y: H(k.x, k.z - k.r - 0.8), hp: 1e6, maxHp: 1e6, r: 0.55, speed: 0, atkCd: 0, face: 0, dead: false, deathT: 0, wob: 0, burrowed: false, bT: 0, uT: 0, lost: 0 });
  for (let i = 0; i < 30 * 3; i++) step(s, 1 / 30);
  ok('the bunker takes the hits for the soldiers inside', s.bk[0].hp < K.hp && inside.every((m, i) => m.hp >= hp0[i]));
  const snap = decode(JSON.parse(JSON.stringify(snapshot(s))));
  ok('who is inside and the building HP survive the trip', snap.units.get(inside[0].id).inB === 0 && snap.bunkers[0] === Math.round(s.bk[0].hp));
  s.bk[0].hp = 1; s.bugs[s.bugs.length - 1].atkCd = 0;
  for (let i = 0; i < 30; i++) step(s, 1 / 30);
  ok('when it falls, everyone inside is thrown out', s.bk[0].hp === 0 && inside.every(m => m.inB === -1));
  order(s, 'move', [inside[0].id], { x: k.x, z: k.z });
  ok('and a wrecked bunker is no use', inside[0].order.type !== 'enter');
}
{
  const s = newMatch(DEFAULTS); s.nextWaveAt = s.reinforceAt = 9999;
  const k = BUNKERS[1], m = s.marines.find(x => x.type === 'marine');
  addSpear(s, 'p1', 'Ash'); redeploy(s, 'p1', m.id);
  ok('a Spear away from any door cannot go in', !spearGarrison(s, 'p1').ok);
  Object.assign(m, { x: k.dx, z: k.dz, y: H(k.dx, k.dz) });
  ok('at the door, a Spear can go in', spearGarrison(s, 'p1').ok && m.inB === 1);
  spearPose(s, 'p1', { u: m.id, x: 0, y: 0, z: 0, yaw: 1, g: 1 });
  step(s, 1 / 30);
  ok('inside, the Spear can turn but not walk off', near(m.face, 1) && Math.hypot(m.x - k.x, m.z - k.z) < k.r);
  ok('and can come back out', spearGarrison(s, 'p1').ok && m.inB === -1);
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
  const vm = [...v.units.values()];
  ok('unit types survive the trip', vm.some(u => u.type === 'strider') && vm.filter(u => u.team === 'm').every(u => u.type));
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
