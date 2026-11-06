/* Swarmbreak: maps, match rules, the wire format and lobby seats, tested
 * without a browser.
 *
 * Every browser in a match builds the deck from (level, seed), so the map
 * generator must be deterministic and every deck must be finishable: the
 * exit, every nest and every pickup reachable on foot from the start.
 *
 * Run: node apps/portfolio/test/swarmbreak.test.mjs
 */
import { LEVELS, TILE, WEAPONS, MAX_BODIES, TEAM_LIVES, cleanConfig, DEFAULTS } from '../../swarmbreak/js/config.js';
import { buildLevel, flood, blocked } from '../../swarmbreak/js/map.js';
import {
  newMatch, step, addPlayer, removePlayer, snapshot, decode, interpolate, serialize, restore, mapOf, nestsLeft, retryLevel, onExit, startLevel,
} from '../../swarmbreak/js/sim.js';
import { bodies, seat, pickHost, cleanName } from '../../swarmbreak/js/lobby.js';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ' : ' + extra : ''}`); failures++; }
};
const DT = 1 / 30;
const run = (s, inputs, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) step(s, typeof inputs === 'function' ? inputs(s) : inputs, DT); };

console.log('\nconfig');
{
  ok('defaults survive cleaning', JSON.stringify(cleanConfig(DEFAULTS)) === JSON.stringify(DEFAULTS));
  const c = cleanConfig({ startLevel: 99, swarm: 9, friendlyFire: 'yes' });
  ok('values are clamped', c.startLevel === LEVELS.length - 1 && c.swarm === 2 && c.friendlyFire === false);
}

console.log('\nmaps');
for (let level = 0; level < LEVELS.length; level++) {
  let bad = '';
  for (const seed of [1, 7, 42, 1234, 99999, 2 ** 31 - 1]) {
    const m = buildLevel(level, seed);
    const again = buildLevel(level, seed);
    if (m.tiles.join('') !== again.tiles.join('') || JSON.stringify(m.foes) !== JSON.stringify(again.foes)) { bad = `seed ${seed} differs between builds`; break; }
    const d = flood(m, [m.spawn]);
    const reach = p => d[p.y * m.w + p.x] >= 0;
    if (!reach(m.spawn)) { bad = `seed ${seed}: spawn is in a wall`; break; }
    if (!reach({ x: m.exit.x + 1, y: m.exit.y + 1 })) { bad = `seed ${seed}: exit unreachable`; break; }
    if (!m.nests.every(reach)) { bad = `seed ${seed}: a nest is walled in`; break; }
    if (!m.pickups.every(reach)) { bad = `seed ${seed}: a pickup is walled in`; break; }
    if (!m.foes.every(reach)) { bad = `seed ${seed}: a bug is walled in`; break; }
    if (!LEVELS[level].boss && m.nests.length !== LEVELS[level].nests) { bad = `seed ${seed}: ${m.nests.length} nests, wanted ${LEVELS[level].nests}`; break; }
    for (let x = 0; x < m.w && !bad; x++) if (!m.tiles[x] || !m.tiles[(m.h - 1) * m.w + x]) bad = `seed ${seed}: hole in the outer wall`;
  }
  ok(`deck ${level + 1} (${LEVELS[level].name}) is the same every build and finishable`, !bad, bad);
}
ok('different seeds give different decks', buildLevel(0, 1).tiles.join('') !== buildLevel(0, 2).tiles.join(''));

console.log('\nmatch');
{
  const s = newMatch({ seed: 5, players: [{ pid: 'a_0', name: 'Josh' }, { pid: 'a_1', name: 'Dan' }] });
  const m = mapOf(s);
  ok('marines start on open floor', Object.values(s.players).every(p => !blocked(m, p.x, p.y, 10)));
  ok('marines get different colours', s.players.a_0.c !== s.players.a_1.c);
  ok('the exit starts locked', !s.exitOpen && nestsLeft(s) === LEVELS[0].nests);

  // Walls stop you.
  const p = s.players.a_0, x0 = p.x;
  run(s, { a_0: { mx: -1, my: 0 } }, 6);
  ok('walking into a wall stops at the wall', p.x < x0 && !blocked(m, p.x, p.y, 10));

  // Shooting kills.
  s.foes = s.foes.filter(f => f.type === 'nest');
  const before = s.kills;
  const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !blocked(m, p.x + dx * 90, p.y + dy * 90, 12));
  s.foes.push({ id: 9001, type: 'crawler', x: p.x + free[0] * 90, y: p.y + free[1] * 90, hp: 22, max: 22, cd: 9, awake: false, a: 0, brood: 0, t2: 3 });
  run(s, { a_0: { a: Math.atan2(free[1], free[0]), fire: true } }, 1);
  ok('the carbine kills a crawler in front of you', s.kills === before + 1 && s.players.a_0.kills === 1);
  ok('the carbine never runs dry', s.players.a_0.ammo[0] === -1);
}

console.log('\nfriendly fire');
for (const ff of [false, true]) {
  const s = newMatch({ seed: 5, cfg: { friendlyFire: ff }, players: [{ pid: 'a_0', name: 'A' }, { pid: 'a_1', name: 'B' }] });
  s.foes = s.foes.filter(f => f.type === 'nest');
  const a = s.players.a_0, b = s.players.a_1, m = mapOf(s);
  const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !blocked(m, a.x + dx * 60, a.y + dy * 60, 12));
  b.x = a.x + free[0] * 60; b.y = a.y + free[1] * 60; a.inv = 0; b.inv = 0;
  run(s, { a_0: { a: Math.atan2(free[1], free[0]), fire: true }, a_1: { px: b.x, py: b.y } }, 0.6);
  ok(ff ? 'with friendly fire on, you can hurt a teammate' : 'with friendly fire off, teammates are safe', ff ? b.hp < 100 : b.hp === 100);
}

console.log('\npickups, deaths and the exit');
{
  const s = newMatch({ seed: 11, players: [{ pid: 'a_0', name: 'A' }, { pid: 'b_0', name: 'B' }] });
  const a = s.players.a_0;
  s.pickups = [{ id: 1, kind: 'scatter', x: a.x, y: a.y }];
  run(s, {}, DT);
  ok('walking over a weapon picks it up and readies it', a.w === 1 && a.ammo[1] === WEAPONS[1].ammo);
  run(s, { a_0: { fire: true } }, 0.1);
  ok('it spends ammo', a.ammo[1] === WEAPONS[1].ammo - 1);

  // Team respawns.
  s.foes = s.foes.filter(f => f.type === 'nest');
  a.inv = 0; a.hp = 1;
  s.shots.push({ id: 77, k: 'acid', x: a.x, y: a.y, vx: 0, vy: 0, dmg: 50, o: 'foe', life: 1, hit: [] });
  run(s, {}, DT);
  ok('a downed marine spends a team respawn', !a.alive && s.lives === TEAM_LIVES - 1 && a.respawnT > 0);
  run(s, {}, 6);
  ok('and comes back', a.alive && a.hp === 100);

  // Clear the nests: the exit opens, and the level ends only once everyone
  // standing is on the pad.
  s.foes = [];
  run(s, {}, DT);
  ok('no nests opens the exit', s.exitOpen);
  const e = mapOf(s).exit;
  a.x = (e.x + 1.5) * TILE; a.y = (e.y + 1.5) * TILE;
  run(s, {}, DT);
  ok('one marine on the pad is not enough', s.phase === 'play' && onExit(s, a));
  const b = s.players.b_0; b.x = a.x + 8; b.y = a.y;
  run(s, {}, DT);
  ok('everyone on the pad clears the deck', s.phase === 'clear');
  run(s, {}, 4.2);
  ok('then the next deck starts', s.phase === 'play' && s.level === 1 && !s.exitOpen && s.lives === TEAM_LIVES);
  ok('weapons carry over to the next deck', a.ammo[1] > 0);
}

console.log('\nlosing');
{
  const s = newMatch({ seed: 3, players: [{ pid: 'a_0', name: 'A' }] });
  s.lives = 0;
  const a = s.players.a_0; a.inv = 0; a.hp = 1;
  s.shots.push({ id: 77, k: 'acid', x: a.x, y: a.y, vx: 0, vy: 0, dmg: 50, o: 'foe', life: 1, hit: [] });
  run(s, {}, DT);
  ok('no respawns left and nobody standing loses the deck', s.phase === 'lost');
  retryLevel(s);
  ok('retry restarts the same deck', s.phase === 'play' && s.level === 0 && a.alive && s.lives === TEAM_LIVES);
}

console.log('\nthe boss');
{
  const s = newMatch({ seed: 9, cfg: { startLevel: LEVELS.length - 1 }, players: [{ pid: 'a_0', name: 'A' }] });
  ok('the last deck has the Matriarch', s.foes.some(f => f.type === 'matriarch'));
  s.foes = s.foes.filter(f => f.type === 'matriarch');
  run(s, {}, DT);
  ok('the exit stays shut while she lives', !s.exitOpen);
  s.foes = [];
  run(s, {}, DT);
  const e = mapOf(s).exit, a = s.players.a_0;
  a.x = (e.x + 1.5) * TILE; a.y = (e.y + 1.5) * TILE;
  run(s, {}, DT);
  ok('killing her and reaching the pad wins', s.phase === 'won');
}

console.log('\nsoak');
{
  // Two marines flailing for three minutes on every deck: nothing throws and
  // nothing ends up inside a wall.
  let bad = '';
  for (let level = 0; level < LEVELS.length && !bad; level++) {
    const s = newMatch({ seed: 100 + level, cfg: { startLevel: level }, players: [{ pid: 'a_0', name: 'A' }, { pid: 'a_1', name: 'B' }] });
    let i = 0;
    try {
      run(s, () => { i++; return { a_0: { mx: Math.sin(i / 40), my: Math.cos(i / 55), a: i / 9, fire: true, w: (i >> 7) % 5 }, a_1: { mx: Math.cos(i / 33), my: Math.sin(i / 61), a: -i / 7, fire: true } }; }, 180);
    } catch (e) { bad = `deck ${level + 1}: ${e.stack}`; break; }
    const m = mapOf(s);
    if (s.foes.some(f => f.type !== 'nest' && blocked(m, f.x, f.y, 2))) bad = `deck ${level + 1}: a bug ended up in a wall`;
    if (Object.values(s.players).some(p => blocked(m, p.x, p.y, 5))) bad = `deck ${level + 1}: a marine ended up in a wall`;
    if (s.foes.some(f => !Number.isFinite(f.x) || !Number.isFinite(f.y))) bad = `deck ${level + 1}: a bug went to NaN`;
  }
  ok('three minutes of chaos on every deck', !bad, bad);
}

console.log('\nwire');
{
  const s = newMatch({ seed: 21, players: [{ pid: 'u1_0', name: 'Josh' }, { pid: 'u2_0', name: 'Mike' }] });
  run(s, { u1_0: { mx: 1, fire: true } }, 1);
  const n = JSON.parse(JSON.stringify(snapshot(s)));
  const d = decode(n);
  ok('a snapshot survives JSON', d.players.length === 2 && d.foes.length === s.foes.length && d.level === 0);
  ok('it is small', JSON.stringify(n).length < 6000, `${JSON.stringify(n).length} bytes`);
  // Firebase drops empty arrays.
  const stripped = { ...n }; delete stripped.s; delete stripped.k; delete stripped.e;
  const d2 = decode(stripped);
  ok('missing lists decode as empty', d2.shots.length === 0 && d2.pickups.length === 0 && d2.events.length === 0);
  const half = interpolate(decode({ ...n, f: n.f.map(f => [f[0], f[1], 0, 0, f[4], 0, 1]) }), d, 0.5);
  ok('interpolation blends between snapshots', half.foes[0].x === d.foes[0].x / 2);

  const saved = JSON.parse(JSON.stringify(serialize(s)));
  // What Firebase hands back: empty arrays gone.
  for (const sh of saved.shots || []) delete sh.hit;
  if (!saved.pickups.length) delete saved.pickups;
  const r = restore(saved);
  run(r, {}, 2);
  ok('a saved match resumes on another browser', r.level === s.level && Object.keys(r.players).length === 2 && Array.isArray(r.shots));
  ok('restored ammo keeps the endless carbine', r.players.u1_0.ammo[0] === -1);
}

console.log('\njoining mid-match');
{
  const s = newMatch({ seed: 4, players: [{ pid: 'a_0', name: 'A' }] });
  addPlayer(s, 'b_0', 'B');
  ok('marines added at the start get their own spawn spot', s.players.b_0.x !== s.players.a_0.x || s.players.b_0.y !== s.players.a_0.y);
  run(s, {}, 4);
  s.players.a_0.x += 40;
  addPlayer(s, 'e_0', 'E');
  const d = Math.hypot(s.players.e_0.x - s.players.a_0.x, s.players.e_0.y - s.players.a_0.y);
  ok('a late joiner drops in next to the squad', d > 0 && d < 30, `${d}`);
  removePlayer(s, 'e_0');
  for (const pid of ['c_0', 'c_1', 'd_0']) addPlayer(s, pid, pid);
  ok(`no more than ${MAX_BODIES} marines`, Object.keys(s.players).length === MAX_BODIES);
  removePlayer(s, 'b_0');
  ok('leaving removes the marine', !s.players.b_0);
}

console.log('\nlobby');
{
  let players = seat({}, 'u1', ['Josh', 'Dan'], 1000);
  players = seat(players, 'u2', ['Tim'], 2000);
  ok('one browser can bring two marines', bodies(players).length === 3 && bodies(players)[1].pid === 'u1_1');
  ok('a fourth fits', !!seat(players, 'u3', ['Mike'], 3000));
  ok('a fifth does not', seat(seat(players, 'u3', ['Mike'], 3000), 'u4', ['Ry'], 4000) === null);
  players.u2.online = false; players.u2.leftAt = 2500;
  const p2 = seat(players, 'u4', ['Ry', 'Bo'], 4000);
  ok('an away browser gives up its seat when the room is full', p2 && !p2.u2 && bodies(p2).length === 4);
  ok('a long-gone browser is cleared out', !seat({ old: { names: ['X'], online: false, leftAt: 0, joined: 0 } }, 'u1', ['A'], 11 * 60 * 1000).old);
  ok('names arrive from Firebase as objects too', bodies({ u: { names: { 0: 'A', 1: 'B' }, joined: 1, online: true } }).length === 2);
  const room = { u1: { names: ['A'], joined: 1, online: false }, u2: { names: ['B'], joined: 2, online: true }, u3: { names: ['C'], joined: 3, online: true } };
  ok('host passes to the longest-standing online browser', pickHost(room, 'u1') === 'u2');
  ok('an online host keeps it', pickHost(room, 'u3') === 'u3');
  ok('names are cleaned', cleanName('  <Cam>\n   the   Great  ') === 'Cam the Great' && cleanName('x'.repeat(40)).length === 18);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
