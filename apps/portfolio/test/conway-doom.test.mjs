/* Conway's DOOM (Camboy cartridge #4), tested without a browser.
 *
 * The Life engine, the patterns, the guns and their eaters, and every
 * level: can it be finished, does it stay sane for a long time, and does
 * nothing start on top of anything else.
 *
 * Run: node apps/portfolio/test/conway-doom.test.mjs
 */
import {
  CELL, TICK, FLOOR, STONE, EXIT, step, population, SCAR_TICKS, scarred, PATTERNS, orient, stamp, gunWithEater, gliderWithEater,
  LEVELS, buildLevel, endlessLevel, canFinish, moveBox, blockedAt, boxCells, faceFrom, validSave,
  CORE, CORE_HP, coreSpawn, coreEvery, makeRng,
} from '../public/projects/camboy/carts/conway-doom/rules.mjs';
import { SONGS } from '../public/projects/camboy/carts/conway-doom/sound.mjs';
import { compile, midi } from '../public/projects/camboy/js/chip.mjs';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ': ' + extra : ''}`); failures++; }
};
const field = (w, h) => ({ w, h, cells: new Uint8Array(w * h), tiles: new Uint8Array(w * h) });
const run = (f, n) => { let c = f.cells; for (let i = 0; i < n; i++) c = step(c, f.tiles, f.w, f.h); return c; };
const where = (c, w) => [...c].flatMap((v, i) => (v ? [`${i % w},${(i / w) | 0}`] : [])).join(' ');

console.log('\nthe game of life');
{
  const f = field(10, 10); stamp(f.cells, 10, PATTERNS.block.rows, 4, 4);
  ok('a block never changes', where(run(f, 7), 10) === where(f.cells, 10));
  const b = field(10, 10); stamp(b.cells, 10, PATTERNS.blinker.rows, 3, 4);
  ok('a blinker flips every tick and comes back', where(run(b, 1), 10) === '4,3 4,4 4,5' && where(run(b, 2), 10) === where(b.cells, 10));
  const g = field(20, 20); stamp(g.cells, 20, PATTERNS.glider.rows, 2, 2);
  const g4 = run(g, 4);
  ok('a glider moves one cell down and right every four ticks', where(g4, 20) === where(g.cells, 20).split(' ').map((p) => p.split(',').map(Number)).map(([x, y]) => `${x + 1},${y + 1}`).join(' '));
  const t = field(6, 6); stamp(t.cells, 6, PATTERNS.blinker.rows, 1, 2); t.tiles[1 * 6 + 2] = STONE;
  ok('nothing is ever born on stone', run(t, 1)[1 * 6 + 2] === 0);
  const e = field(6, 6); stamp(e.cells, 6, PATTERNS.blinker.rows, 1, 2); e.tiles[3 * 6 + 2] = EXIT;
  ok('or on the exit', run(e, 1)[3 * 6 + 2] === 0);
  const born = [], died = [];
  step(b.cells, b.tiles, 10, 10, born, died);
  ok('a step reports what was born and what died', born.length === 2 && died.length === 2);
  const l = field(8, 8); stamp(l.cells, 8, ['OO', 'O.'], 3, 3);
  ok('shoot one cell of a block and the other three grow it back', where(run(l, 1), 8) === '3,3 4,3 3,4 4,4');
  // With the scar from the shot, it stays broken a moment, so a second shot has time to land.
  const scars = new Uint8Array(64); scars[4 * 8 + 4] = SCAR_TICKS;
  let c = l.cells;
  for (let t = 0; t < SCAR_TICKS; t++) { c = step(c, scarred(l.tiles, scars), 8, 8); scars.forEach((v, i) => { if (v) scars[i]--; }); }
  ok('a shot leaves a scar: the block stays broken for a couple of ticks', where(c, 8) === '3,3 4,3 3,4');
  ok('then heals', where(step(c, scarred(l.tiles, scars), 8, 8), 8) === '3,3 4,3 3,4 4,4');
  const two = c.slice(); two[3 * 8 + 3] = 0;
  ok('but a second shot in time finishes it', population(step(two, l.tiles, 8, 8)) === 0);
}

console.log('\npatterns');
{
  ok('every pattern has a name, a kind and a guide entry that fits', Object.values(PATTERNS).every((p) => p.name && p.kind && p.desc && p.name.length <= 38 && wrapLines(p.desc) <= 4));
  ok('turning a pattern four times brings it home', Object.values(PATTERNS).every((p) => orient(p.rows, 0).join() === p.rows.join() && orient(orient(p.rows, 1), 3).join() === p.rows.join()));
  ok('every turn of a glider is still five cells', [...Array(8).keys()].every((k) => orient(PATTERNS.glider.rows, k).join('').split('O').length - 1 === 5));
  const still = ['block', 'beehive', 'loaf', 'boat', 'eater'].every((k) => { const p = PATTERNS[k].rows; const f = field(12, 12); stamp(f.cells, 12, p, 4, 4); return where(run(f, 5), 12) === where(f.cells, 12); });
  ok('the still lifes really are still', still);
  const periods = { blinker: 2, toad: 2, beacon: 2, pulsar: 3 };
  ok('the oscillators repeat on time', Object.entries(periods).every(([k, n]) => { const f = field(21, 21); stamp(f.cells, 21, PATTERNS[k].rows, 4, 4); return where(run(f, n), 21) === where(f.cells, 21) && where(run(f, 1), 21) !== where(f.cells, 21); }));
}
function wrapLines(t, n = 38) { let lines = 0, line = ''; for (const w of t.split(' ')) { if (!line) line = w; else if (line.length + 1 + w.length <= n) line += ' ' + w; else { lines++; line = w; } } return lines + (line ? 1 : 0); }

console.log('\nguns and eaters');
{
  for (const n of [4, 6, 10, 16]) {
    const rows = gunWithEater(n), w = rows[0].length + 6, h = rows.length + 6;
    const f = field(w, h); stamp(f.cells, w, rows, 2, 2);
    let c = f.cells; const pops = [];
    for (let t = 0; t < 1200; t++) { c = step(c, f.tiles, w, h); pops.push(population(c)); }
    const tail = pops.slice(900);
    ok(`a glider gun with its eater ${n} down the lane runs forever, every thirty ticks`, tail.every((p, i) => i < 30 || p === tail[i - 30]) && Math.max(...tail) < 100);
  }
  const rows = gliderWithEater(12), w = rows[0].length + 4, h = rows.length + 4;
  const f = field(w, h); stamp(f.cells, w, rows, 2, 2);
  ok('a lone glider ends up eaten, and the eater is whole again', population(run(f, 120)) === 7);
}

console.log('\nlevels');
{
  ok('six hand-built levels, then endless fields', LEVELS.length === 6);
  for (let i = 0; i < LEVELS.length + 4; i++) {
    const raw = i < LEVELS.length ? LEVELS[i]() : endlessLevel(i - LEVELS.length + 1, 77);
    const L = buildLevel(i, 77);
    const name = `${i + 1} ${L.title}`;
    ok(`${name}: you can reach the exit`, canFinish(L));
    ok(`${name}: the start and the pickups sit on bare floor`, [raw.start, ...raw.items].every((p) => !raw.cells[p.y * raw.w + p.x] && raw.tiles[p.y * raw.w + p.x] === FLOOR));
    ok(`${name}: the exit is two by two and clear`, [0, 1].every((dx) => [0, 1].every((dy) => L.tiles[(L.exit.y + dy) * L.w + L.exit.x + dx] === EXIT)));
    let c = L.cells; const pops = [population(c)];
    for (let t = 0; t < 1500; t++) { c = step(c, L.tiles, L.w, L.h); pops.push(population(c)); }
    const tail = pops.slice(1200);
    ok(`${name}: it never boils over`, Math.max(...pops) <= Math.max(3 * pops[0], pops[0] + 150), `max ${Math.max(...pops)} from ${pops[0]}`);
    if (L.title.includes('GUN')) ok(`${name}: the guns keep firing and the eaters keep eating`, tail.every((p, k) => k < 30 || p === tail[k - 30]) && Math.max(...tail) > Math.min(...tail));
    if (L.title === 'OSCILLATORS') ok(`${name}: the pulsar and the blinkers keep going`, tail.every((p, k) => k < 6 || p === tail[k - 6]) && Math.max(...tail) > Math.min(...tail));
    if (L.title === 'GLIDERS') {
      // Run it again without the three gliders: if they were all eaten cleanly, the two fields end up the same.
      let quiet = L.cells.slice();
      for (const gx of [2, 10, 18]) for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [2, 1], [1, 2]]) quiet[(2 + dy) * L.w + gx + dx] = 0;
      for (let t = 0; t < 1500; t++) quiet = step(quiet, L.tiles, L.w, L.h);
      ok(`${name}: every glider is eaten, and nothing else is disturbed`, quiet.every((v, k) => v === c[k]));
    }
  }
  ok('an endless field is the same every time for the same game', JSON.stringify([...buildLevel(9, 5).cells]) === JSON.stringify([...buildLevel(9, 5).cells]));
  ok('and different in a different game', JSON.stringify([...buildLevel(9, 5).cells]) !== JSON.stringify([...buildLevel(9, 6).cells]));
  let all = true;
  for (let n = 1; n <= 25; n++) for (const seed of [1, 2, 3]) if (!canFinish(endlessLevel(n, seed))) all = false;
  ok('every endless field can be finished (75 of them)', all);
  ok('fields grow, up to a limit', endlessLevel(1, 1).w < endlessLevel(8, 1).w && endlessLevel(50, 1).w <= 64 && endlessLevel(50, 1).h <= 48);
}

console.log('\ncores');
{
  ok('the lab after the first level has cores, and the fields get more', buildLevel(1).cores.length >= 1 && buildLevel(0).cores.length === 0 && endlessLevel(8, 1).cores.length > endlessLevel(1, 1).cores.length);
  ok('a core is a 2x2 block you can\'t walk through, with hit points', (() => { const L = buildLevel(1), c = L.cores[0]; return L.tiles[c.y * L.w + c.x] === CORE && L.tiles[(c.y + 1) * L.w + c.x + 1] === CORE && blockedAt(L, L.cells, c.x * CELL + 1, c.y * CELL + 1) && c.hp === CORE_HP; })());
  ok('cores speed up the longer you take, down to every six ticks', coreEvery({ every: 18 }, 0) === 18 && coreEvery({ every: 18 }, 450) < 18 && coreEvery({ every: 18 }, 99999) === 6);
  for (const i of [1, 4, 6, 9]) {
    const L = buildLevel(i, 3), rng = makeRng(99), hero = { x: L.start.x, y: L.start.y };
    let c = L.cells.slice(), spawns = 0, nearHero = false, over = 0;
    const cores = L.cores.map((k) => ({ ...k }));
    for (let gen = 0; gen < 2000; gen++) {
      c = step(c, L.tiles, L.w, L.h);
      for (const k of cores) {
        if (++k.t < coreEvery(k, gen)) continue;
        k.t = 0;
        const put = coreSpawn(L, c, k, rng, hero, gen);
        if (put) { spawns++; if (put.some((p) => Math.abs((p % L.w) - hero.x) < 4 && Math.abs(((p / L.w) | 0) - hero.y) < 4)) nearHero = true; }
      }
      over = Math.max(over, population(c) - L.cap);
    }
    ok(`${i + 1} ${L.title}: its cores keep feeding the field (${spawns} spawns in 2000 ticks)`, spawns > 40);
    ok(`${i + 1} ${L.title}: they stop at the cap, so it never chokes (Life can still breed a little past it)`, over <= L.cap * 0.1, `over by ${over}`);
    ok(`${i + 1} ${L.title}: nothing ever spawns right next to you`, !nearHero);
  }
}

console.log('\nmoving and aiming');
{
  const L = buildLevel(0);
  const cells = new Uint8Array(L.w * L.h);
  cells[15 * L.w + 6] = 1;
  ok('a live cell blocks you', blockedAt(L, cells, 6 * CELL + 1, 15 * CELL + 1) && !blockedAt(L, cells, 5 * CELL + 1, 15 * CELL + 1));
  const b = moveBox(L, cells, { x: 4 * CELL, y: 15 * CELL, s: 3 }, 20, 0);
  ok('and stops you walking into it', b.x + 3 <= 6 * CELL);
  ok('stone stops you too', moveBox(L, cells, { x: 2 * CELL, y: 15 * CELL, s: 3 }, -20, 0).x >= CELL);
  ok('a box knows which cells it stands on', boxCells(L, 3.5, 3.5, 3).length === 4 && boxCells(L, 4.5, 4.5, 3).length === 1);
  const R = { x: 1, y: 0 }, U = { x: 0, y: -1 };
  ok('you aim up, down, left or right, keeping your aim on a diagonal', faceFrom(1, 0.2, U).x === 1 && faceFrom(0.707, -0.707, U) === U && faceFrom(0.1, 0, R) === R);
  ok('the clock ticks about three times a second', TICK > 0.2 && TICK < 0.5);
}

console.log('\nsaves');
{
  ok('a save is a level and a seed', validSave({ level: 3, seed: 9 }) && !validSave(null) && !validSave({ level: -1, seed: 1 }) && !validSave({ level: 2 }));
}

console.log('\nmusic');
{
  for (const [name, song] of Object.entries(SONGS)) {
    const bad = song.lead.findIndex((b) => b.trim().split(/\s+/).length !== 16);
    ok(`${name}: every lead bar is sixteen steps`, bad === -1, `bar ${bad + 1}`);
    const c = compile(song);
    ok(`${name}: everything lands inside the song, in range`, c.leadSteps === c.steps && c.lead.every((e) => e.note >= midi('E4') && e.note <= midi('E6')));
  }
}

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
