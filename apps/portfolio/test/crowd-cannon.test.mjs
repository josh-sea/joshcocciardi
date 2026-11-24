/* Crowd Cannon: levels, gates, spinners, upgrades and saves.
 *
 * Run: node apps/portfolio/test/crowd-cannon.test.mjs
 */
import * as L from '../../crowd-cannon/js/logic.js';

let failures = 0, passes = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${extra !== '' ? ' — ' + JSON.stringify(extra) : ''}`); }
};

console.log('gates');
{
  ok('×3 makes two more', L.gateClones({ kind: 'mul', value: 3 }) === 2);
  ok('+4 makes four more', L.gateClones({ kind: 'add', value: 4 }) === 4);
  ok('labels', L.gateLabel({ kind: 'mul', value: 2 }) === '×2' && L.gateLabel({ kind: 'add', value: 5 }) === '+5');
  const g = { kind: 'mul', value: 2, x: 1, z: -10, w: 3, sweep: 0, speed: 0, phase: 0 };
  ok('crossing inside the gate counts', L.crossesGate(g, 0, 2, -9.9, -10.1));
  ok('crossing beside the gate does not', !L.crossesGate(g, 0, 3, -9.9, -10.1));
  ok('not reaching the line does not', !L.crossesGate(g, 0, 1, -9.5, -9.9));
  ok('already past does not', !L.crossesGate(g, 0, 1, -10.1, -10.5));
  const m = { ...g, x: 0, sweep: 10, speed: 1, phase: 0 };
  let inside = true;
  for (let t = 0; t < 20; t += 0.1) {
    const x = L.gateX(m, t);
    if (Math.abs(x) + m.w / 2 > L.HALF_W) inside = false;
  }
  ok('moving gates stay on the track', inside);
}

console.log('spinners');
{
  const h = { x: 0, z: -20, len: 4, thick: 0.4, speed: 0, phase: 0 };
  ok('touching the bar hits', L.hitsSpinner(h, 0, 1.5, -20));
  ok('past its end misses', !L.hitsSpinner(h, 0, 3, -20));
  ok('well off the bar misses', !L.hitsSpinner(h, 0, 0, -21.5));
  const turned = { ...h, phase: Math.PI / 2 };
  ok('a turned bar hits along z', L.hitsSpinner(turned, 0, 0, -21.5) && !L.hitsSpinner(turned, 0, 1.5, -20));
}

console.log('levels');
{
  ok('same level, same layout', JSON.stringify(L.makeLevel(7)) === JSON.stringify(L.makeLevel(7)));
  ok('levels differ', JSON.stringify(L.makeLevel(7)) !== JSON.stringify(L.makeLevel(8)));
  let sane = true, why = null;
  for (let n = 1; n <= 60; n++) {
    const lv = L.makeLevel(n);
    for (const g of lv.gates) {
      if (g.z >= -2 || g.z <= -lv.length + 3) { sane = false; why = { n, z: g.z }; }
      if (Math.abs(g.x) + g.w / 2 > L.HALF_W + 1e-9) { sane = false; why = { n, x: g.x, w: g.w }; }
      if (!(g.value >= 2)) { sane = false; why = { n, v: g.value }; }
    }
    if (lv.gates.length > L.MAX_GATES || lv.gates.length < 2) { sane = false; why = { n, gates: lv.gates.length }; }
    for (const s of lv.spinners) if (s.z >= -2 || s.z <= -lv.length + 3) { sane = false; why = { n, s: s.z }; }
  }
  ok('gates and spinners sit on the track for 60 levels', sane, why);
  ok('first gate is a centred ×2', (() => { const g = L.makeLevel(1).gates[0]; return g.kind === 'mul' && g.value === 2 && g.x === 0; })());
  ok('fort gets tougher', L.makeLevel(10).fortHp > L.makeLevel(5).fortHp && L.makeLevel(5).fortHp > L.makeLevel(1).fortHp);
  ok('no spinners before level 4', [1, 2, 3].every((n) => L.makeLevel(n).spinners.length === 0) && L.makeLevel(4).spinners.length > 0);
  ok('no brutes on level 1', L.makeLevel(1).enemy.bruteEvery === 0 && L.makeLevel(2).enemy.bruteEvery > 0);
}

console.log('barricades, bosses and ogres');
{
  ok('no barricades on level 1', L.makeLevel(1).barriers.length === 0);
  let fine = true, why = null;
  for (let n = 2; n <= 60; n++) {
    const lv = L.makeLevel(n);
    if (!lv.barriers.length) { fine = false; why = { n, none: true }; }
    for (const b of lv.barriers) {
      const bonus = lv.gates.find((g) => g.bonus && g.x === b.x && g.z < b.z && b.z - g.z < 4);
      if (!bonus) { fine = false; why = { n, b }; }
      if (Math.abs(b.x) + b.w / 2 > L.HALF_W + 1e-9) { fine = false; why = { n, wide: b }; }
      if (b.z >= -2 || b.z <= -lv.length + 3) { fine = false; why = { n, z: b.z }; }
      // Barricades leave the middle of the track open for the enemy.
      if (Math.abs(b.x) - b.w / 2 < 0.3) { fine = false; why = { n, blocks: b }; }
      if (b.hp !== L.barrierHp(n)) { fine = false; why = { n, hp: b.hp }; }
    }
  }
  ok('every barricade guards a bonus gate right behind it, at the side', fine, why);
  ok('barricades get tougher', L.barrierHp(10) > L.barrierHp(5));
  ok('every fifth level is a boss', [5, 10, 15].every((n) => L.makeLevel(n).boss) && ![4, 6, 9].some((n) => L.makeLevel(n).boss));
  ok('a boss fort is tougher than the level after it', L.makeLevel(5).fortHp > L.makeLevel(6).fortHp);
  ok('boss levels pay double', L.makeLevel(5).reward > L.makeLevel(6).reward);
  ok('ogres from level 3', L.makeLevel(2).enemy.ogreEvery === 0 && L.makeLevel(3).enemy.ogreEvery > 0);
  ok('boss ogres come more often', L.makeLevel(10).enemy.ogreEvery < L.makeLevel(11).enemy.ogreEvery);
  ok('ogres hurt the wall most', L.WALL_DAMAGE.ogre > L.WALL_DAMAGE.brute && L.WALL_DAMAGE.brute > L.WALL_DAMAGE.grunt);
}

console.log('squad');
{
  const none = L.stats({});
  ok('bruisers and bombers start locked', none.bruiserEvery === 0 && none.bomberEvery === 0);
  ok('locked squad means every shot is a runner', Array.from({ length: 50 }, (_, i) => L.shotKind(i + 1, none)).every((k) => k === 'runner'));
  const st = L.stats({ bruiser: 3, bomber: 2 });
  const kinds = Array.from({ length: 60 }, (_, i) => L.shotKind(i + 1, st));
  ok('unlocked bruisers come every Nth shot', kinds.filter((k) => k === 'bruiser').length >= 60 / st.bruiserEvery - 1 - 60 / st.bomberEvery);
  ok('unlocked bombers come every Nth shot', kinds.filter((k) => k === 'bomber').length === Math.floor(60 / st.bomberEvery));
  ok('more levels, more often', L.stats({ bruiser: 6 }).bruiserEvery < L.stats({ bruiser: 1 }).bruiserEvery);
  ok('a runner chips a barricade, a bruiser spends its hit points', L.barrierDamage('runner', 1, st) === 1 && L.barrierDamage('bruiser', 5, st) === 5);
  ok('a bomber hits a barricade hard', L.barrierDamage('bomber', 1, st) === st.bomberHit && st.bomberHit > 5);
  ok('champions hit the fort hardest', L.fortDamage('champ', st) > L.fortDamage('bomber', st) && L.fortDamage('bruiser', st) > L.fortDamage('runner', st));
  ok('wall and head start upgrades', L.stats({ wall: 2, start: 3 }).homeBonus === 10 && L.stats({ start: 3 }).startSquad === 18);
  ok('double shot chance stays a chance', L.stats({ double: L.UPGRADES.double.max }).doubleChance < 1);
}

console.log('upgrades and saves');
{
  ok('upgrades cost more each time', L.upgradeCost('rate', 1) > L.upgradeCost('rate', 0));
  const s0 = L.stats({}), s5 = L.stats({ rate: 5, charge: 5, champ: 5 });
  ok('upgrades help', s5.shotsPerSec > s0.shotsPerSec && s5.chargeShots < s0.chargeShots && s5.champHp > s0.champHp);
  ok('charge never drops below 12 shots', L.stats({ charge: 99 }).chargeShots >= 12);
  const save = { ...L.newSave(), coins: 45 };
  const r = L.buy(save, 'rate');
  ok('buying spends coins and levels up', r.ok && r.save.coins === 5 && r.save.up.rate === 1);
  ok('cannot buy when short', !L.buy(r.save, 'rate').ok);
  ok('cannot buy past max', !L.buy({ ...save, coins: 1e9, up: { ...save.up, rate: L.UPGRADES.rate.max } }, 'rate').ok);
  const dirty = L.cleanSave({ level: -3, coins: 'lots', up: { rate: 99, junk: 4 }, sound: false });
  ok('bad saves are cleaned', dirty.level === 1 && dirty.coins === 0 && dirty.up.rate === L.UPGRADES.rate.max && !('junk' in dirty.up) && dirty.sound === false);
  ok('null save is a fresh save', L.cleanSave(null).level === 1);
  const lv = L.makeLevel(3);
  ok('an unhurt wall pays a bonus', L.winCoins(lv, lv.homeHp) > L.winCoins(lv, 1));
  ok('the wall bonus counts upgraded walls', L.winCoins(lv, 40, 40) === L.winCoins(lv, lv.homeHp));
  ok('old saves get the new upgrades at zero', (() => { const c = L.cleanSave({ level: 4, up: { rate: 2 } }); return c.up.rate === 2 && c.up.bruiser === 0 && c.up.bomber === 0 && c.up.wall === 0; })());
  ok('a loss pays for damage done', L.loseCoins(lv, 0) > L.loseCoins(lv, lv.fortHp / 2) && L.loseCoins(lv, lv.fortHp) === 0);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
