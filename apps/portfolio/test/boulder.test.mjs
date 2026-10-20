/* Boulder Smash (Camboy cartridge #2): the rules, tested without a browser.
 *
 * The button combos, who can be hurt by what, and the city layouts are a
 * plain module, so the things a kid would notice going wrong (a slam that
 * comes out as a punch, a boss that can't be beaten, a gate that never
 * opens) are checkable here.
 *
 * Run: node apps/portfolio/test/boulder.test.mjs
 */
import {
  CITIES, BOSSES, GROUND, ARENA, GATE_SHARE, JUMP_V, LEAP_V, SLAM_RADIUS, SUPER_RADIUS,
  layoutCity, smashedShare, gateOpen, chooseAction, damageTo, quakeRadius, flies, overlap,
  unlockAfter, throwRange, throwPeak, jumpHeight, buildingHp,
} from '../public/projects/camboy/carts/boulder/rules.mjs';
import { SONGS } from '../public/projects/camboy/carts/boulder/sound.mjs';
import { compile, midi } from '../public/projects/camboy/js/chip.mjs';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); failures++; }
};

console.log('\nthe buttons');
{
  const ground = { onGround: true, vy: 0, leaped: false, holding: null, punchCd: 0 };
  const rising = { onGround: false, vy: -150, leaped: false, holding: null, punchCd: 0 };
  const leapt = { onGround: false, vy: -100, leaped: true, holding: null, punchCd: 0 };
  const falling = { onGround: false, vy: 120, leaped: false, holding: null, punchCd: 0 };
  const none = { up: false, a: false, b: false, down: false };
  ok('UP on the ground jumps', chooseAction(ground, { ...none, up: true }) === 'jump');
  ok('UP in the air does nothing', chooseAction(rising, { ...none, up: true }) === null);
  ok('A on the ground punches', chooseAction(ground, { ...none, a: true }) === 'punch');
  ok('punches have a short cooldown', chooseAction({ ...ground, punchCd: 0.1 }, { ...none, a: true }) === null);
  ok('A while jumping up leaps', chooseAction(rising, { ...none, a: true }) === 'leap');
  ok('the leap still works just past the top of the jump', chooseAction({ ...rising, vy: 40 }, { ...none, a: true }) === 'leap');
  ok('one leap per jump', chooseAction(leapt, { ...none, a: true }) === 'punch');
  ok('A while falling is an air punch', chooseAction(falling, { ...none, a: true }) === 'punch');
  ok('jump, then DOWN + A slams', chooseAction(rising, { ...none, a: true, down: true }) === 'slam');
  ok('DOWN + A slams on the way down too', chooseAction(falling, { ...none, a: true, down: true }) === 'slam');
  ok('leap, then DOWN + A super slams', chooseAction(leapt, { ...none, a: true, down: true }) === 'super');
  ok('DOWN + A on the ground is just a punch', chooseAction(ground, { ...none, a: true, down: true }) === 'punch');
  ok('B picks something up', chooseAction(ground, { ...none, b: true }) === 'grab');
  const holding = { ...ground, holding: { kind: 'rubble' } };
  ok('B while holding throws', chooseAction(holding, { ...none, b: true }) === 'throw');
  ok('A while holding throws too', chooseAction(holding, { ...none, a: true }) === 'throw');
  ok('B wins over A when both land on the same frame', chooseAction(ground, { ...none, a: true, b: true }) === 'grab');
}

console.log('\nreach');
{
  ok('a jump clears a goon and a zap', jumpHeight() > 30);
  ok('a leap goes higher than a jump', jumpHeight(LEAP_V) > jumpHeight(JUMP_V));
  ok('a throw flies well past arm\'s reach', throwRange() > 40);
  ok('a high throw (UP + B) gets up to where Dr. Fizzle flies', GROUND - 24 - throwPeak(-320) < 50);
  const top = GROUND - 18 - jumpHeight(JUMP_V) - jumpHeight(LEAP_V) * 0.7;
  ok('a leap near the top of a jump reaches the saucer', top < 50, top.toFixed(0));
  ok('a super slam reaches twice as far as a slam', SUPER_RADIUS === SLAM_RADIUS * 2 && quakeRadius('super') > quakeRadius('slam'));
  ok('punches make no quake', quakeRadius('punch') === 0);
  ok('boxes overlap the obvious way', overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }) && !overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }));
}

console.log('\nwho gets hurt by what');
{
  ok('buildings take every hit', ['punch', 'leap', 'slam', 'super', 'throw'].every((a) => damageTo('building', a) > 0));
  ok('a super slam hits a building hardest', damageTo('building', 'super') > damageTo('building', 'slam'));
  ok('punches bounce off steel', damageTo('steel', 'punch') === 0 && damageTo('steel', 'super') === 0);
  ok('throwing things breaks steel', damageTo('steel', 'throw') > 0);
  ok('one good hit bonks a goon', ['punch', 'leap', 'slam', 'throw'].every((a) => damageTo('goon', a) === 1));
  ok('a brute takes a few', damageTo('brute', 'punch') === 1);
  ok('Grumble shrugs off punches', damageTo('grumble', 'punch') === 0);
  ok('but not thrown stuff or slams', damageTo('grumble', 'throw') > 0 && damageTo('grumble', 'slam') > 0);
  ok('Rocko only feels his own boulders, throws and quakes', damageTo('rocko', 'punch') === 0 && damageTo('rocko', 'batted') > 0 && damageTo('rocko', 'throw') > 0);
  ok('Bruno is armored until he crashes', damageTo('bruno', 'punch') === 0 && damageTo('bruno', 'super') === 0);
  ok('a dizzy Bruno takes everything', damageTo('bruno', 'punch', { dizzy: true }) > 0 && damageTo('bruno', 'super', { dizzy: true }) > 0);
  ok('throws chip at Bruno even when he is not dizzy', damageTo('bruno', 'throw') > 0);
  ok('only leaps and throws reach Dr. Fizzle', damageTo('fizzle', 'leap') > 0 && damageTo('fizzle', 'throw') > 0 && damageTo('fizzle', 'punch') === 0 && damageTo('fizzle', 'slam') === 0);
  ok('robots and Dr. Fizzle fly above the quakes', flies('robot') && flies('fizzle') && !flies('goon'));
  for (const [kind, b] of Object.entries(BOSSES)) {
    const ways = ['punch', 'leap', 'slam', 'super', 'throw', 'batted'].filter((a) => damageTo(kind, a, { dizzy: true }) > 0);
    ok(`${b.name} can be beaten`, ways.length > 0 && b.hp > 0);
  }
}

console.log('\nthe cities');
{
  ok('four cities, each with a boss', CITIES.length === 4 && CITIES.every((c) => BOSSES[c.boss]));
  ok('the bosses come in the original order', CITIES.map((c) => c.boss).join() === 'grumble,rocko,bruno,fizzle');
  CITIES.forEach((c, i) => {
    const w = layoutCity(i);
    const bs = w.buildings;
    const apart = bs.every((b, k) => k === 0 || b.x >= bs[k - 1].x + bs[k - 1].w + 20);
    ok(`${c.name}: buildings stand apart along the street`, bs.length >= 8 && apart, `${bs.length} buildings`);
    ok(`${c.name}: a clear stretch to walk in, and room before the gate`, bs[0].x >= 60 && bs.every((b) => b.x + b.w <= w.length - 20));
    ok(`${c.name}: taller buildings take more punches`, bs.every((b) => b.hp === buildingHp(b.h)) && buildingHp(70) > buildingHp(35));
    ok(`${c.name}: everyone trapped is on the street, not inside a building`,
      w.rescues.length === c.rescues.length && w.rescues.every((r) => r.x < w.length && bs.every((b) => r.x < b.x - 6 || r.x > b.x + b.w + 6)));
    ok(`${c.name}: the same street every time`, JSON.stringify(layoutCity(i)) === JSON.stringify(w));
    const half = bs.map((b, k) => ({ ...b, hp: k < Math.ceil(bs.length * GATE_SHARE) ? 0 : b.hp }));
    ok(`${c.name}: the gate opens at ${GATE_SHARE * 100}% smashed, not before`,
      gateOpen(half) && !gateOpen(bs.map((b, k) => ({ ...b, hp: k < Math.ceil(bs.length * GATE_SHARE) - 1 ? 0 : b.hp }))));
  });
  ok('steel shows up from the Iron Yard on', layoutCity(2).rescues.some((r) => r.kind === 'steel') && !layoutCity(1).rescues.some((r) => r.kind === 'steel'));
  ok('nothing smashed is 0%', smashedShare(layoutCity(0).buildings) === 0);
  ok('the arena is one screen', ARENA === 160);
  ok('beating a city unlocks the next', unlockAfter(0, true, 1) === 2 && unlockAfter(0, false, 1) === 1 && unlockAfter(3, true, 4) === 4);
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
