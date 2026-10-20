/* Sweat Boy (Camboy cartridge #1) and the Camboy's stick, tested without a browser.
 *
 * The things a player would notice going wrong (a puddle spawning off the
 * court or on top of another, a swipe that takes two units, the returning
 * players skipping a wet puddle, a clean floor not getting its three) are
 * all checkable on the plain rules module.
 *
 * Run: node apps/portfolio/test/sweat-boy.test.mjs
 */
import {
  COURT, TRIPS, LEVELS, makeRng, tripSpec, puddleRadius, puddleShape, spawnPuddles, wetUnits,
  mopTime, puddleUnder, swipe, sweep, slippedUnits, shotFor, awayPoints, awayAverage, quarterOf,
  unlockAfter, POWERUPS, rollPowerup, touches, botGame,
} from '../public/projects/camboy/carts/sweat-boy/rules.mjs';
import { SONGS, CHORDS, compile, midi, voicing, parseLead } from '../public/projects/camboy/carts/sweat-boy/sound.mjs';
import { stickFrom, dirsFrom } from '../public/projects/camboy/js/hardware.mjs';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); failures++; }
};

console.log('\ntrips');
{
  ok('the first trip is a few single drops', tripSpec(0).count === 3 && tripSpec(0).maxUnits === 1);
  ok('later trips bring more and bigger puddles',
    tripSpec(TRIPS - 1).count > tripSpec(0).count && tripSpec(TRIPS - 1).maxUnits === 4);
  ok('the players come back faster as the game goes on', tripSpec(7).waveSpeed > tripSpec(0).waveSpeed);
  ok('two trips a quarter, four quarters', quarterOf(0) === 1 && quarterOf(1) === 1 && quarterOf(2) === 2 && quarterOf(7) === 4);
  ok('bigger puddles are drawn bigger', [1, 2, 3, 4].every((u) => puddleRadius(u) > puddleRadius(u - 1)));
}

console.log('\nspawning');
{
  let bad = '';
  for (let seed = 1; seed <= 120 && !bad; seed++) {
    for (let trip = 0; trip < TRIPS * LEVELS.length && !bad; trip++) {
      const level = Math.floor(trip / TRIPS);
      const spec = tripSpec(trip % TRIPS, level);
      const ps = spawnPuddles(trip % TRIPS, makeRng(seed * 31 + trip), level);
      if (ps.length !== spec.count) bad = `seed ${seed} trip ${trip}: ${ps.length} of ${spec.count}`;
      for (const p of ps) {
        const { rx, ry } = puddleShape(p.units);
        if (p.units < 1 || p.units > spec.maxUnits) bad = `units ${p.units} on trip ${trip}`;
        if (p.x - rx < COURT.x0 || p.x + rx > COURT.x1 || p.y - ry < COURT.y0 || p.y + ry > COURT.y1) bad = `off court at ${p.x},${p.y}`;
      }
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        if (Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) < puddleRadius(ps[i].units) + puddleRadius(ps[j].units)) bad = `overlap on trip ${trip}`;
      }
      if (spec.maxUnits > 1 && !ps.some((p) => p.units > 1)) bad = `no big puddle on trip ${trip}`;
    }
  }
  ok('every puddle at every venue is on the court, apart, and the right size', !bad, bad);
  const a = spawnPuddles(5, makeRng(9)), b = spawnPuddles(5, makeRng(9));
  ok('the same seed lays out the same floor', JSON.stringify(a) === JSON.stringify(b));
  const ps = spawnPuddles(6, makeRng(4));
  const bigX = ps.filter((p) => p.units > 1).map((p) => p.x);
  ok('big puddles land around the key, where the scrum was', bigX.every((x) => x >= 104));
}

console.log('\nmopping');
{
  const p = { x: 60, y: 70, units: 3, max: 3, locked: false };
  const ps = [p, { x: 100, y: 70, units: 1, max: 1, locked: false }];
  ok('the mop head over a puddle finds it', puddleUnder(ps, 61, 71) === 0);
  ok('a near miss still counts', puddleUnder(ps, 60 + puddleShape(3).rx + 2, 70) === 0);
  ok('open floor finds nothing', puddleUnder(ps, 80, 70) === -1);
  ok('one swipe takes one unit', swipe(p) === false && p.units === 2);
  swipe(p);
  ok('the last swipe dries it', swipe(p) === true && p.units === 0);
  ok('a dry spot cannot be mopped again', swipe(p) === false && p.units === 0);
  ok('and the mop no longer finds it', puddleUnder(ps, 60, 70) === -1);
  ok('wet units only count what is left', wetUnits(ps) === 1);
  const fresh = spawnPuddles(7, makeRng(2));
  ok('more sweat means more time on the clock', mopTime(7, fresh) > mopTime(7, fresh.slice(0, 2)));
}

console.log('\nthe players come back');
{
  const ps = [
    { x: 30, y: 40, units: 1, max: 1, locked: false },
    { x: 80, y: 90, units: 0, max: 2, locked: false },
    { x: 125, y: 70, units: 3, max: 3, locked: false },
  ];
  ok('nothing slips before the front gets there', sweep(ps, 10).length === 0);
  const first = sweep(ps, 40);
  ok('the front slips on the near puddle first', first.length === 1 && first[0] === ps[0]);
  ok('a mopped-dry spot is safe', sweep(ps, 90).length === 0);
  ok('a slipped puddle cannot be mopped any more', puddleUnder(ps, 30, 40) === -1 && swipe(ps[0]) === false);
  ps[2].units = 1; // mopped down while the players were still crossing
  sweep(ps, 200);
  ok('what is left when they arrive is what counts', slippedUnits(ps) === 2);
  ok('nothing slips twice', sweep(ps, 300).length === 0 && slippedUnits(ps) === 2);
}

console.log('\nthe shot');
{
  ok('a spotless floor goes for three', shotFor(0).points === 3);
  ok('any slip makes it a two', shotFor(1).points === 2);
  ok('every slip costs the shooter', shotFor(1).chance > shotFor(2).chance && shotFor(2).chance > shotFor(3).chance);
  ok('but you can always get lucky', shotFor(40).chance > 0);
  const rng = makeRng(11);
  const pts = Array.from({ length: 2000 }, () => awayPoints(rng));
  ok('the away team scores 0, 2 or 3', pts.every((p) => [0, 2, 3].includes(p)));
  const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
  ok('a clean floor out-scores the away team on average', shotFor(0).chance * 3 > avg + 0.5, `away ${avg.toFixed(2)}`);
  ok('a sloppy floor does not', shotFor(3).chance * 2 < avg, `away ${avg.toFixed(2)}`);
}

console.log('\nvenues');
{
  const specs = LEVELS.map((_, l) => tripSpec(TRIPS - 1, l));
  const rising = (f) => specs.every((sp, i) => i === 0 || f(sp) >= f(specs[i - 1]));
  ok('five venues, Rec Center to the Finals', LEVELS.length === 5 && LEVELS[0].name === 'REC CENTER' && LEVELS[4].name === 'THE FINALS');
  ok('each venue brings as much sweat or more', rising((sp) => sp.count) && rising((sp) => sp.maxUnits));
  ok('each venue gives less time per unit', rising((sp) => -sp.perUnit) && rising((sp) => -sp.baseTime));
  ok('each venue brings the players back faster', rising((sp) => sp.waveSpeed) && specs[4].waveSpeed > specs[0].waveSpeed);
  ok('each away team is better than the last', LEVELS.every((_, l) => l === 0 || awayAverage(l) > awayAverage(l - 1)));
  const rng = makeRng(5);
  const away = Array.from({ length: 4000 }, () => awayPoints(rng, 4));
  ok('the away team scores what the venue says it does', Math.abs(away.reduce((a, b) => a + b, 0) / away.length - awayAverage(4)) < 0.1);
  ok('a win unlocks the next venue', unlockAfter(0, true, 1) === 2 && unlockAfter(2, true, 3) === 4);
  ok('a loss unlocks nothing', unlockAfter(0, false, 1) === 1);
  ok('replaying an old venue never takes anything away', unlockAfter(0, true, 4) === 4 && unlockAfter(4, true, 5) === 5);

  // A bot that always works the puddle the players reach first. skill 1 is
  // a perfect run; a person tapping a phone plays nearer 0.7.
  const winRate = (level, skill) => {
    const r = makeRng(1000 + level);
    let w = 0;
    for (let i = 0; i < 300; i++) w += botGame(level, skill, r).won;
    return w / 300;
  };
  const perfect = LEVELS.map((_, l) => winRate(l, 1));
  const human = LEVELS.map((_, l) => winRate(l, 0.7));
  ok('a perfect mopper can win at every venue', perfect.every((w) => w >= 0.75), perfect.map((w) => w.toFixed(2)).join(' '));
  ok('the Rec Center is a gentle start', human[0] >= 0.9, human[0].toFixed(2));
  ok('every venue is harder than the one before', human.every((w, i) => i === 0 || w <= human[i - 1] + 0.02), human.map((w) => w.toFixed(2)).join(' '));
  ok('the Finals take a few tries', human[4] <= 0.2, human[4].toFixed(2));
}

console.log('\npower-ups');
{
  ok('never on the very first trip', Array.from({ length: 200 }, (_, i) => rollPowerup(0, makeRng(i), [])).every((x) => x === null));
  let dropped = 0, onPuddle = 0;
  const kinds = new Set();
  for (let i = 0; i < 1000; i++) {
    const rng = makeRng(i);
    const ps = spawnPuddles(5, rng, 2);
    const it = rollPowerup(5, rng, ps);
    if (!it) continue;
    dropped++;
    kinds.add(it.kind);
    if (ps.some((p) => Math.hypot(p.x - it.x, p.y - it.y) <= puddleRadius(p.max) + 10)) onPuddle++;
  }
  ok('they show up now and then, not every trip', dropped > 250 && dropped < 550, `${dropped} in 1000`);
  ok('all three kinds turn up', kinds.size === 3 && [...kinds].every((k) => POWERUPS[k]));
  ok('never on top of a puddle', onPuddle === 0);
  ok('walking over one picks it up', touches({ x: 50, y: 60 }, 52, 66) && !touches({ x: 50, y: 60 }, 70, 66));
  const p = { x: 0, y: 0, units: 3, max: 3, locked: false };
  ok('the Jumbo Mop takes two units a swipe', swipe(p, POWERUPS.jumbo.units) === false && p.units === 1 && swipe(p, 2) === true && p.units === 0);
  ok('and reaches a little further', puddleUnder([{ x: 0, y: 0, units: 1, max: 1 }], 9, 0, POWERUPS.jumbo.slack) === 0 && puddleUnder([{ x: 0, y: 0, units: 1, max: 1 }], 9, 0) === -1);
  ok('each one is temporary', POWERUPS.jumbo.lasts === 'trip' && POWERUPS.kicks.lasts === 'slip' && POWERUPS.timeout.lasts === 'instant');
}

console.log('\nthe Camboy stick');
{
  const c = stickFrom(0.05, -0.1);
  ok('a thumb resting on the middle is centered', c.x === 0 && c.y === 0);
  const up = stickFrom(0.1, -0.9);
  ok('anywhere past the middle is a full push', Math.abs(Math.hypot(up.x, up.y) - 1) < 1e-9);
  const far = stickFrom(3.5, 0.2);
  ok('sliding off the pad keeps going the same way', far.x > 0.99 && dirsFrom(far).right && !dirsFrom(far).up);
  const d = dirsFrom(stickFrom(1, -1));
  ok('a diagonal presses both directions', d.up && d.right && !d.down && !d.left);
  const near = dirsFrom(stickFrom(1, -0.3));
  ok('mostly sideways reads as sideways', near.right && !near.up);
}

console.log('\nmusic');
{
  ok('notes are named the usual way', midi('A4') === 69 && midi('C4') === 60 && midi('G#5') === 80);
  ok('chords stack upward from the root', Object.keys(CHORDS).every((c) => { const v = voicing(c, 4); return v[0] < v[1] && v[1] < v[2] && v[2] - v[0] < 12; }));
  const held = parseLead(['C5 . . - E5 . G5 . . . . . . . - -']);
  ok('a held note lasts until the next note or rest', held.events[0].len === 3 && held.events[1].len === 2 && held.events[2].len === 8);
  for (const [name, song] of Object.entries(SONGS)) {
    const badBar = song.lead.findIndex((b) => b.trim().split(/\s+/).length !== 16);
    ok(`${name}: every lead bar is sixteen steps`, badBar === -1, `bar ${badBar + 1}`);
    ok(`${name}: one lead bar per chord`, song.lead.length === song.chords.length);
    ok(`${name}: drum bars are sixteen steps`, !song.drums || song.drums.every((d) => d.length === 16 && /^[ksh.]+$/.test(d)));
    const c = compile(song);
    const all = [...c.lead, ...c.bass, ...c.arp];
    ok(`${name}: everything lands inside the song`, all.every((e) => e.step >= 0 && e.step + e.len <= c.steps) && c.leadSteps === c.steps);
    ok(`${name}: bass sits low and the lead sits high`, c.bass.every((e) => e.note >= midi('E2') && e.note <= midi('C4')) && c.lead.every((e) => e.note >= midi('E4') && e.note <= midi('E6')));
  }
  ok('the game song and title loop, the jingles do not', SONGS.game.loop && SONGS.title.loop && !SONGS.win.loop && !SONGS.lose.loop);
}

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
