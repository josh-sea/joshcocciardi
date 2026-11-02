/* Dark Hat: Sorcerer's Escape (Camboy cartridge #3, Campbell's game), tested
 * without a browser.
 *
 * The maps, tricks, names, story text and run saves are a plain module, so
 * the things a player would hit (a room you can't reach, a door blocked by
 * a pillar, a path you could switch after committing, a save that loads
 * broken, story text running off the screen) are checkable here.
 *
 * Run: node apps/portfolio/test/dark-hat.test.mjs
 */
import {
  COLS, ROWS, TILE, NAME_LEN, LINE_CHARS, SOUL_MAX, SOUL_DRAIN, STORY, LAYERS, BOSSES, ENEMIES, TEMPLATES,
  DOOR_COLS, DOOR_ROWS, cleanName, say, layoutLayer, neighbor, roomTiles,
  ATTACKS, DEFENSES, BONUSES, TIERS, statsOf, attackStats, defenseStats, upgradeNames, nextPick, describePick, applyPick,
  SHOW_ALL, bookPaths, nodeKey, allNodeKeys, demoBuild, keysForPick,
  moveBox, reachable, drainSoul, gainSoul, newRun, validRun, upgradeRun, beatBoss, descend, faceFrom, roomEnemies,
  SPEED, RABBIT, rabbitLanding,
  CASTLE, CASTLE_LAYER, castleTiles, castleEnemies, SIDE, sideStep, sideMove, tileAt, standsOn, T_WALL, T_LEDGE, T_LADDER,
} from '../public/projects/camboy/carts/dark-hat/rules.mjs';
import { SONGS } from '../public/projects/camboy/carts/dark-hat/sound.mjs';
import { compile, midi } from '../public/projects/camboy/js/chip.mjs';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); failures++; }
};

console.log('\nnames and words');
{
  ok('a name is up to four letters', cleanName('campbell') === 'CAMP' && cleanName('bo') === 'BO');
  ok('only letters survive', cleanName('c@m!1') === 'CM');
  ok('no name falls back to HERO', cleanName('') === 'HERO' && cleanName('   ') === 'HERO' && cleanName(null) === 'HERO');
  ok('trailing blanks are dropped', cleanName('BO  ') === 'BO');
  ok('the name goes into the story', say('{N} FELL IN!', 'cam').join(' ') === 'CAM FELL IN!');
  const all = [...STORY.intro, ...STORY.escape, STORY.spiritIntro, STORY.spiritAttack, STORY.spiritDefense, STORY.spiritUpgrade, STORY.spiritBonus, STORY.bossGift, STORY.fountain, STORY.caught, STORY.ladder,
    ...STORY.castleIntro, ...STORY.castleLand, STORY.castleBoss, STORY.castleDoor, ...STORY.castleExit, STORY.castleBack,
    ...STORY.flightIntro, STORY.flightHelp, STORY.flightCaught];
  const longest = Math.max(...all.flatMap((t) => say(t, 'WWWW')).map((l) => l.length));
  ok('every line of story fits the text box, even with a four letter name', longest <= LINE_CHARS, `longest ${longest}`);
  ok('a page of story fits on the screen', all.every((t) => say(t, 'WWWW', 36).length <= 6));
  const paths = [...Object.values(ATTACKS), ...Object.values(DEFENSES)];
  ok('every attack and defense fits its box in two lines (four to a screen)', paths.every((p) => say(p.desc, 'X', 37).length <= 2 && p.name.length <= 22));
  const ups = paths.flatMap((p) => p.tiers.flat());
  ok('every upgrade fits its box in three lines', ups.every((u) => say(u.desc, 'X', 36).length <= 3 && u.name.length <= 20));
  ok('the bonuses fit too', BONUSES.every((b) => say(b.desc, 'X', 36).length <= 3));
}

console.log('\nattack and defense');
{
  ok('four attacks: cards, wand, hat, scarf', Object.keys(ATTACKS).join() === 'cards,wand,hat,scarf');
  ok('four defenses: shield, vanish, decoy, storm', Object.keys(DEFENSES).join() === 'shield,blink,decoy,storm');
  const all = [...Object.values(ATTACKS), ...Object.values(DEFENSES)];
  ok(`every path has ${TIERS} tiers of two upgrades`, all.every((p) => p.tiers.length === TIERS && p.tiers.every((t) => t.length === 2)));
  ok('every upgrade only touches numbers the path has', all.every((p) => p.tiers.flat().every((u) => [u.add, u.mul, u.set].every((o) => !o || Object.keys(o).every((k) => k in p.base)))));
  ok('upgrade ids are unique within a path', all.every((p) => new Set(p.tiers.flat().map((u) => u.id)).size === p.tiers.flat().length));
  // Every combination of upgrades gives sane numbers.
  let sane = true;
  for (const [cat, catalog] of [['a', ATTACKS], ['d', DEFENSES]]) for (const [id, p] of Object.entries(catalog)) {
    for (let mask = 0; mask < 8; mask++) {
      const st = statsOf({ id, ups: p.tiers.map((t, i) => t[(mask >> i) & 1].id) }, catalog);
      if (!(st.cd > 0.1 && st.cd < 15) || ('dmg' in st && !(st.dmg >= 1)) || Object.values(st).some((v) => typeof v === 'number' && !Number.isFinite(v))) sane = false;
    }
  }
  ok('every build, all 8 per path, has sane cooldowns and damage', sane);
  ok('the ace sniper throws one card that pierces and hits hard', (() => { const st = statsOf({ id: 'cards', ups: ['twin', 'wide', 'ace'] }, ATTACKS); return st.count === 1 && st.pierce && st.dmg >= 4 && st.cd > ATTACKS.cards.base.cd; })());
  ok('more cards versus heavier cards is a real trade', statsOf({ id: 'cards', ups: ['twin'] }, ATTACKS).count === 2 && statsOf({ id: 'cards', ups: ['heavy'] }, ATTACKS).dmg === 2);

  const r = newRun('cam', 1);
  ok('a new run has the plain card toss on A and nothing on B', r.attack.id === 'cards' && !r.attack.picked && r.defense === null && attackStats(r).count === 1 && defenseStats(r) === null);
  let p = nextPick(r, 'spirit');
  ok('the first spirit offers the four attacks', p.type === 'attack' && p.options.length === 4);
  ok('each option has a name and description', describePick(r, p).every((o) => o.name && o.desc));
  ok('picking the wand puts it on A', applyPick(r, p, 1) === true && r.attack.id === 'wand' && r.attack.picked);
  ok('an attack is picked only once', applyPick(r, p, 2) === false && r.attack.id === 'wand');
  p = nextPick(r, 'spirit');
  ok('the second spirit offers the four defenses', p.type === 'defense' && p.options.join() === 'shield,blink,decoy,storm');
  ok('picking vanish puts it on B', applyPick(r, p, 1) === true && r.defense.id === 'blink' && applyPick(r, p, 0) === false);
  p = nextPick(r, 'spirit');
  ok('after that, spirits upgrade: the attack first', p.type === 'upgrade' && p.tree === 'attack' && p.options.join() === 'steer,hunt');
  applyPick(r, p, 0);
  p = nextPick(r, 'boss');
  ok('then the defense, so they grow together', p.type === 'upgrade' && p.tree === 'defense' && p.options.join() === 'far,quick');
  applyPick(r, p, 1);
  ok('upgrades show up in the numbers', attackStats(r).steer === true && defenseStats(r).cd < DEFENSES.blink.base.cd);
  ok('and in the trick book', upgradeNames(r.attack, ATTACKS).join() === 'STEERED WAND' && upgradeNames(r.defense, DEFENSES).join() === 'QUICK BLINK');
  for (let i = 0; i < 4; i++) applyPick(r, nextPick(r, 'boss'), 0);
  ok('both paths max out at three upgrades', r.attack.ups.length === 3 && r.defense.ups.length === 3);
  p = nextPick(r, 'spirit');
  ok('a maxed-out run gets a bonus choice instead', p.type === 'bonus' && p.options.join() === 'heart,soul');
  const hp = r.maxHp;
  applyPick(r, p, 0);
  ok('a bigger heart adds a heart and heals', r.maxHp === hp + 2 && r.hp === r.maxHp);
  applyPick(r, nextPick(r, 'spirit'), 1);
  ok('a deep soul slows the drain', r.deep === 1 && drainSoul(50, 10, 1) > drainSoul(50, 10, 0));
  for (let i = 0; i < 9; i++) applyPick(r, nextPick(r, 'spirit'), 1);
  ok('deep soul stops at three', r.deep === 3);

  const k = newRun('bo', 2);
  ok('keeping the card toss earns a free upgrade', applyPick(k, nextPick(k, 'spirit'), 0) === 'extra' && k.attack.id === 'cards' && k.attack.picked);
  ok('and that upgrade is for the cards', (() => { const q = nextPick(k, 'boss'); return q.type === 'upgrade' && q.tree === 'attack' && q.options.join() === 'twin,heavy'; })());

  const s = newRun('cam', 3);
  applyPick(s, nextPick(s, 'spirit'), 2); // hat, and never a defense
  let allAttack = true;
  for (let i = 0; i < 3; i++) { const q = nextPick(s, 'boss'); if (q.tree !== 'attack') allAttack = false; applyPick(s, q, 0); }
  ok('skip the defense and every upgrade goes to your attack', allAttack && s.attack.ups.length === 3 && s.defense === null);
  ok('bosses never hand out a new attack or defense, only upgrades', nextPick(newRun('x', 4), 'boss').type === 'upgrade');
  ok('a boss upgrades your plain cards if you have not met a spirit yet', nextPick(newRun('x', 5), 'boss').options.join() === 'twin,heavy');
  const t = newRun('x', 6); applyPick(t, nextPick(t, 'spirit'), 3);
  ok('the scarf whips hard up close', attackStats(t).dmg === 2 && attackStats(t).reach > 20);
}

console.log('\nthe spell book');
{
  const paths = bookPaths();
  ok('eight paths in the book, attacks then defenses', paths.length === 8 && paths.slice(0, 4).every((p) => p.kind === 'a') && paths.slice(4).every((p) => p.kind === 'd'));
  const keys = allNodeKeys();
  ok('56 entries: 8 paths and 48 upgrades, each with its own key', keys.length === 56 && new Set(keys).size === 56);
  ok('upgrades start hidden', SHOW_ALL === false);
  let demos = true;
  for (const p of paths) {
    const cat = p.kind === 'a' ? ATTACKS : DEFENSES;
    for (let t = -1; t < TIERS; t++) for (const col of [0, 1]) {
      const b = demoBuild(p, t, col);
      const st = statsOf(b, cat);
      if (b.ups.length !== t + 1 || !(st.cd > 0)) demos = false;
      if (t >= 0 && b.ups[t] !== p.tiers[t][col].id) demos = false;
    }
  }
  ok('every entry has a working demo build', demos);
  const r = newRun('cam', 9);
  let q = nextPick(r, 'spirit');
  ok('picking a path unlocks its entry', keysForPick(r, q, 2).join() === 'a:hat');
  applyPick(r, q, 2);
  q = nextPick(r, 'spirit');
  ok('picking a defense unlocks its entry', keysForPick(r, q, 0).join() === 'd:shield');
  applyPick(r, q, 0);
  q = nextPick(r, 'boss');
  ok('taking an upgrade unlocks that upgrade', keysForPick(r, q, 1).join() === 'a:hat:grow' && keys.includes('a:hat:grow'));
  ok('bonuses are not in the book', keysForPick(r, { type: 'bonus', options: ['heart', 'soul'] }, 0).length === 0);
  ok('the dummies in the practice room never hurt', ENEMIES.dummy.touch === 0 && ENEMIES.dummy.speed === 0);
}

console.log('\nthe hat');
{
  ok('four layers down to Malvado, his castle third', LAYERS.length === 4 && LAYERS[3].boss === 'malvado' && CASTLE_LAYER === 2 && LAYERS[2].side);
  ok('every boss and enemy is defined', LAYERS.every((L) => BOSSES[L.boss] && L.enemies.every((e) => ENEMIES[e])));
  const spirits = LAYERS.map((_, i) => layoutLayer(i).rooms.filter((r) => r.kind === 'spirit').length);
  ok('two spirits on the first layer (an attack and a defense), more below to upgrade', spirits[0] === 2 && spirits[1] + spirits[2] >= 3);
  ok('enough spirits and bosses to max out both paths', spirits.reduce((a, b) => a + b, 0) - 2 + (LAYERS.length - 1) >= TIERS * 2);
  LAYERS.forEach((L, i) => {
    if (L.side) return; // the castle has its own checks below
    const lay = layoutLayer(i);
    const ids = lay.rooms.map((r) => r.id);
    const seen = new Set([lay.start]);
    const q = [lay.start];
    while (q.length) {
      const cur = q.shift();
      for (const d of ['up', 'down', 'left', 'right']) { const n = neighbor(lay, cur, d); if (n != null && !seen.has(n)) { seen.add(n); q.push(n); } }
    }
    ok(`${L.name}: every room can be reached from the start`, seen.size === ids.length);
    ok(`${L.name}: one start, one boss`, lay.rooms.filter((r) => r.kind === 'start').length === 1 && lay.rooms.filter((r) => r.kind === 'boss').length === 1);
    const doorsMatch = lay.rooms.every((r) => ['up', 'down', 'left', 'right'].every((d) => {
      const n = neighbor(lay, r.id, d);
      if (n == null) return true;
      const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[d];
      return neighbor(lay, n, back) === r.id;
    }));
    ok(`${L.name}: every door has a door on the other side`, doorsMatch);
    const open = lay.rooms.every((room) => {
      const t = roomTiles(room);
      const from = reachable(t, 10, 8);
      const doorTiles = [];
      if (room.doors.up) doorTiles.push([DOOR_COLS[0], 0]);
      if (room.doors.down) doorTiles.push([DOOR_COLS[0], ROWS - 1]);
      if (room.doors.left) doorTiles.push([0, DOOR_ROWS[0]]);
      if (room.doors.right) doorTiles.push([COLS - 1, DOOR_ROWS[0]]);
      return doorTiles.every(([x, y]) => from.has(`${x},${y}`));
    });
    ok(`${L.name}: no pillar ever blocks a door`, open);
  });
  ok('every template leaves the middle of the room open', TEMPLATES.every((tpl, i) => {
    const t = roomTiles({ template: i, doors: { up: true, down: true, left: true, right: true } });
    return reachable(t, 1, DOOR_ROWS[0]).size > 150;
  }));
  const sealed = roomTiles({ template: 0, doors: { up: true, down: true, left: true, right: true } }, true);
  ok('a sealed boss room has no way out', sealed[0][DOOR_COLS[0]] === 1 && sealed[DOOR_ROWS[0]][0] === 1);
  const t = roomTiles({ template: 0, doors: { up: false, down: false, left: false, right: false } });
  const b = moveBox(t, { x: 10, y: 10, w: 6, h: 6 }, -20, 0);
  ok('walls stop you', b.x >= TILE);
  const r = newRun('bo', 42);
  ok('the same room fills the same way each visit', JSON.stringify(roomEnemies(r, 1, 4)) === JSON.stringify(roomEnemies(r, 1, 4)));
  ok('deeper layers bring more enemies', roomEnemies(r, 3, 0).length >= 5 && roomEnemies(r, 3, 0).length <= 6);
}

console.log('\nthe giant rabbit');
{
  const far = rabbitLanding({ x: 20, y: 20 }, { x: 140, y: 100 });
  ok('he never hops more than one hop toward you', Math.abs(Math.hypot(far.x - 20, far.y - 20) - RABBIT.hop) < 1e-9);
  const near = rabbitLanding({ x: 20, y: 20 }, { x: 40, y: 30 });
  ok('when you are close he lands right where you are', near.x === 40 && near.y === 30);
  ok('his shadow gives you time to run out of the ring', SPEED * RABBIT.air > RABBIT.ring + 4);
  ok('even when he is angry and hopping faster', SPEED * RABBIT.airFast > RABBIT.ring + 4);
  ok('the ring stops well short of the walls', RABBIT.ring < 50);
}

console.log('\nthe card shield');
{
  ok('three cards to start', DEFENSES.shield.base.cards === 3);
  ok('its description says the cards last until used', /EACH BLOCKS OR HITS ONCE/.test(DEFENSES.shield.desc));
  ok('steel cards block twice, a fortress adds cards', statsOf({ id: 'shield', ups: ['four', 'steel'] }, DEFENSES).tough === 2 && statsOf({ id: 'shield', ups: ['four', 'wide', 'fortress'] }, DEFENSES).cards === 6);
}

console.log('\nthe soul and the run');
{
  ok('a full soul lasts about four minutes', SOUL_MAX / SOUL_DRAIN > 200 && SOUL_MAX / SOUL_DRAIN < 260);
  ok('the soul drains and stops at empty', drainSoul(10, 5) < 10 && drainSoul(1, 100) === 0);
  ok('freeing a spirit refills a lot, a sparkle a little', gainSoul(10, 'spirit') - 10 > gainSoul(10, 'sparkle') - 10);
  ok('the soul never overflows', gainSoul(SOUL_MAX - 1, 'spirit') === SOUL_MAX);
  const r = newRun('cam', 7);
  ok('a new run is valid', validRun(r));
  ok('a run survives a trip through the save', validRun(JSON.parse(JSON.stringify(r))));
  ok('broken saves are refused', !validRun(null) && !validRun({}) && !validRun({ ...r, layer: 9 }) && !validRun({ ...r, hp: 0 }) && !validRun({ ...r, attack: { id: 'laser', ups: [], picked: true } }) && !validRun({ ...r, attack: { id: 'cards', ups: ['ace'], picked: true } }) && !validRun({ ...r, defense: { id: 'blink', ups: ['far', 'nope'] } }));
  ok('saves from the old trick system start fresh', !validRun({ ...r, v: 1 }));
  const u = newRun('cam', 8); applyPick(u, nextPick(u, 'spirit'), 0); applyPick(u, nextPick(u, 'boss'), 1); applyPick(u, nextPick(u, 'spirit'), 0);
  ok('a run with a full build survives a trip through the save', validRun(JSON.parse(JSON.stringify(u))));
  ok('an empty soul is a caught run, not a save', !validRun({ ...r, soul: 0 }));
  const before = r.maxHp;
  ok('beating a boss is not the end until Malvado', beatBoss(r) === false);
  ok('a boss gives a heart and heals you', r.maxHp === before + 2 && r.hp === r.maxHp);
  descend(r);
  ok('the ladder goes to the next layer\'s start', r.layer === 1 && r.room === layoutLayer(1).start);
  descend(r);
  ok('the castle comes after the catacombs, at its gate', r.layer === CASTLE_LAYER && r.room === layoutLayer(CASTLE_LAYER).start);
  ok('a run in the castle is a good save', validRun(JSON.parse(JSON.stringify(r))));
  ok('beating the flat rabbit is not the end', beatBoss(r) === false);
  descend(r);
  ok('out of the castle is the bottom', r.layer === 3 && LAYERS[3].boss === 'malvado');
  ok('beating Malvado ends the game', beatBoss(r) === true);
  ok('the name is kept as typed', newRun('cAmP').name === 'CAMP' && NAME_LEN === 4);
}

console.log('\nmalvado\'s castle');
{
  const lay = layoutLayer(CASTLE_LAYER);
  ok('six rooms, a start and a boss', lay.rooms.length === 6 && lay.rooms[lay.start].kind === 'start' && lay.rooms[lay.boss].kind === 'boss');
  ok('every room is sixteen tiles tall, at least a screen wide, and square-edged', CASTLE.every((c) => c.map.length === ROWS && c.map[0].length >= COLS && c.map.every((row) => row.length === c.map[0].length)));
  ok('every room is walled in', CASTLE.every((c) => /^#+$/.test(c.map[0]) && /^#+$/.test(c.map[ROWS - 1]) && c.map.every((row) => row[0] === '#' && row.at(-1) === '#')));
  const letters = lay.rooms.flatMap((r) => r.doors.map((d) => d.id)).filter((l) => l !== 'x');
  ok('every door letter joins exactly two rooms', [...new Set(letters)].every((l) => letters.filter((k) => k === l).length === 2));
  ok('every door leads back to where you came from', lay.rooms.every((r) => r.doors.every((d) => d.id === 'x' || lay.rooms[d.to].doors.some((k) => k.id === d.id && k.to === r.id))));
  ok('the only way out is in the throne room', lay.rooms.flatMap((r) => r.doors.filter((d) => d.id === 'x').map(() => r.kind)).join() === 'boss');
  const doorsSound = lay.rooms.every((r) => {
    const t = castleTiles(r);
    return r.doors.every((d) => [0, 1].every((dx) => [0, 1, 2].every((dy) => t[d.ty - dy][d.tx + dx] === 0)) && [0, 1].every((dx) => standsOn(t, d.tx + dx, d.ty + 1)));
  });
  ok('every door is clear, two by three, with floor under it', doorsSound);
  // The rooms connect through the doors.
  const seen = new Set([lay.start]);
  const q = [lay.start];
  while (q.length) { const id = q.shift(); for (const d of lay.rooms[id].doors) if (d.to != null && !seen.has(d.to)) { seen.add(d.to); q.push(d.to); } }
  ok('every room can be reached from the gate', seen.size === lay.rooms.length);
  ok('one spirit and one fountain in the castle', lay.rooms.filter((r) => r.spirit).length === 1 && lay.rooms.filter((r) => r.fountain).length === 1);
  ok('the spirit\'s room counts as a spirit room', lay.rooms.filter((r) => r.kind === 'spirit').every((r) => r.spirit));

  // The physics.
  const flat = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => (y === ROWS - 1 || x === 0 || x === COLS - 1 ? T_WALL : 0)));
  const body = () => ({ x: 80, y: (ROWS - 1) * TILE - 5, w: 6, h: 10, vx: 0, vy: 0, ground: true, climb: false });
  const sim = (tiles, b, plan, frames) => { let top = b.y; for (let f = 0; f < frames; f++) { sideStep(tiles, b, plan(f), 1 / 60); top = Math.min(top, b.y); } return top; };
  let b = body();
  const rise = b.y - sim(flat, b, (f) => ({ x: 0, up: true, jump: f === 0 }), 90);
  ok('a full jump rises about five tiles', rise > 4.5 * TILE && rise < 5.5 * TILE, `${rise.toFixed(1)}px`);
  ok('and lands back on the floor', b.ground && b.y === (ROWS - 1) * TILE - 5);
  b = body();
  const hop = b.y - sim(flat, b, (f) => ({ x: 0, up: f < 4, jump: f === 0 }), 90);
  ok('letting go of Up early makes a short hop', hop < rise * 0.5, `${hop.toFixed(1)}px`);
  b = body();
  sim(flat, b, () => ({ x: 1 }), 30);
  ok('walking goes at walking speed', Math.abs(b.x - 80 - SIDE.walk * 0.5) < 1);
  b = body(); b.x = 20;
  sim(flat, b, () => ({ x: -1 }), 60);
  ok('walls stop you', b.x - 3 >= TILE);
  const ledge = flat.map((r) => r.slice()); for (let x = 6; x < 14; x++) ledge[11][x] = T_LEDGE;
  b = body();
  sim(ledge, b, (f) => ({ x: 0, up: true, jump: f === 0 }), 90);
  ok('you jump up through a ledge and land on it', b.ground && b.y === 11 * TILE - 5);
  sim(ledge, b, (f) => ({ x: 0, down: f < 2, downPressed: f === 0 }), 60);
  ok('down drops you back through it', b.ground && b.y === (ROWS - 1) * TILE - 5);
  const ladder = flat.map((r) => r.slice()); for (let y = 8; y < ROWS - 1; y++) ladder[y][10] = T_LADDER; for (let x = 11; x < 15; x++) ladder[8][x] = T_WALL;
  b = body(); b.x = 84;
  sim(ladder, b, () => ({ x: 0, up: true }), 200);
  ok('up a ladder, you stand on top of it', b.ground && !b.climb && b.y === 8 * TILE - 5);
  sim(ladder, b, (f) => ({ x: 0, down: true }), 200);
  ok('and down again', b.ground && b.y === (ROWS - 1) * TILE - 5);
  const box = { x: 40, y: 40, w: 6, h: 6 };
  ok('a big fall can\'t skip through the floor', sideMove(flat, box, 0, 400).y === (ROWS - 1) * TILE - 3);
  ok('off the sides is wall, above the top is open', tileAt(flat, -1, 3) === T_WALL && tileAt(flat, 3, -1) === 0);

  // Can every door, spirit and fountain be reached, jumping and climbing, from every door?
  const reach = (room, from) => {
    const tiles = castleTiles(room);
    const spots = new Map();
    const q = [];
    const add = (p) => { const k = `${Math.round(p.x / 3)},${Math.round(p.y)}`; if (!spots.has(k)) { spots.set(k, { x: p.x, y: p.y }); q.push({ x: p.x, y: p.y }); } };
    add(from);
    const run = (s, plan) => {
      const p = { x: s.x, y: s.y, w: 6, h: 10, vx: 0, vy: 0, ground: true, climb: false };
      let left = false;
      for (let f = 0; f < 200; f++) {
        const c = plan(f);
        if (sideStep(tiles, p, c, 1 / 60).spikes) return;
        if (!p.ground) left = true;
        if (p.ground && (left || c.walk) && f > 0) { add(p); if (left) return; }
        if (c.stop) return;
      }
    };
    while (q.length) {
      const s = q.shift();
      for (const d of [-1, 1]) run(s, (f) => ({ x: d, walk: true, stop: f > 4 }));
      for (const d1 of [-1, 0, 1]) for (const d2 of [-1, 0, 1]) for (const k of [0, 8, 16, 26]) for (const hold of [6, 99]) run(s, (f) => ({ x: f < k ? d1 : d2, up: f < hold, jump: f === 0 }));
      run(s, () => ({ x: 0, up: true }));
      run(s, (f) => ({ x: 0, down: true, downPressed: f === 0 }));
      for (const d of [-1, 1]) run(s, (f) => ({ x: f > 30 ? d : 0, up: f <= 30 }));
    }
    return [...spots.values()];
  };
  for (const room of lay.rooms) {
    const starts = room.doors.map((d) => ({ x: d.x, y: d.foot - 5 }));
    if (room.start) starts.push(room.start);
    const missing = [];
    for (const s of starts) {
      const pts = reach(room, s);
      for (const d of room.doors) if (!pts.some((p) => Math.abs(p.x - d.x) < 6 && p.y + 5 === d.foot)) missing.push(d.id);
      for (const thing of [room.spirit, room.fountain]) if (thing && !pts.some((p) => Math.hypot(p.x - thing.x, p.y - thing.y) < 14)) missing.push('spirit or fountain');
    }
    ok(`${room.name}: every door${room.spirit ? ', the spirit' : ''}${room.fountain ? ', the fountain' : ''} can be reached from every door, without spikes`, !missing.length, missing.join());
  }

  const r = newRun('cam', 3);
  const foes = castleEnemies(r, CASTLE_LAYER, lay.rooms[4]);
  ok('the castle fills its rooms the same way each visit', JSON.stringify(foes) === JSON.stringify(castleEnemies(r, CASTLE_LAYER, lay.rooms[4])));
  ok('walkers stand on the floor, fliers fly', foes.every((e) => (LAYERS[CASTLE_LAYER].ground.includes(e.kind) ? standsOn(castleTiles(lay.rooms[4]), Math.floor(e.x / TILE), Math.floor((e.y + 4) / TILE)) : LAYERS[CASTLE_LAYER].air.includes(e.kind))));
  ok('the throne room is only the boss', castleEnemies(r, CASTLE_LAYER, lay.rooms[lay.boss]).length === 0 && BOSSES[LAYERS[CASTLE_LAYER].boss]);

  // Saves from before the castle.
  const old = { ...newRun('bo', 5), beaten: [true, true, false], layer: 2, room: 1, cleared: ['1:3', '2:0'], freed: ['2:1'], fountains: ['2:2'] };
  const up = upgradeRun(old);
  ok('an old save at the bottom stays at the bottom, castle counted as done', up.layer === 3 && up.beaten.join() === 'true,true,true,false' && validRun(up));
  ok('and keeps what it did there', up.cleared.join() === '1:3,3:0' && up.freed.join() === '3:1' && up.fountains.join() === '3:2');
  const early = upgradeRun({ ...newRun('bo', 5), beaten: [true, false, false], layer: 1 });
  ok('an old save higher up still has the castle ahead', early.layer === 1 && early.beaten.join() === 'true,false,false,false' && validRun(early));
  ok('a new save is left alone', upgradeRun(r) === r && !validRun(old));
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
