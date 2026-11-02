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
  COLS, ROWS, TILE, NAME_LEN, LINE_CHARS, SOUL_MAX, SOUL_DRAIN, STORY, TRICKS, LAYERS, BOSSES, ENEMIES, TEMPLATES,
  DOOR_COLS, DOOR_ROWS, cleanName, say, trickStats, knows, choosePath, usable, layoutLayer, neighbor, roomTiles,
  moveBox, reachable, drainSoul, gainSoul, newRun, validRun, beatBoss, descend, faceFrom, roomEnemies,
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
  const all = [...STORY.intro, ...STORY.escape, STORY.spiritIntro, STORY.spiritChoose, STORY.fountain, STORY.caught, STORY.ladder];
  const longest = Math.max(...all.flatMap((t) => say(t, 'WWWW')).map((l) => l.length));
  ok('every line of story fits the text box, even with a four letter name', longest <= LINE_CHARS, `longest ${longest}`);
  ok('a page of story fits on the screen', all.every((t) => say(t, 'WWWW', 36).length <= 6));
  const descs = Object.values(TRICKS).flatMap((t) => Object.values(t.paths));
  ok('every path description fits its box in three lines', descs.every((p) => say(p.desc, 'X', 36).length <= 3 && p.name.length <= 20));
}

console.log('\ntricks');
{
  ok('six tricks', Object.keys(TRICKS).length === 6);
  ok('every trick has exactly two paths', Object.values(TRICKS).every((t) => Object.keys(t.paths).length === 2));
  ok('every path has a cooldown and a name', Object.values(TRICKS).every((t) => Object.values(t.paths).every((p) => p.cd > 0 && p.name && p.desc)));
  const r = newRun('cam', 1);
  ok('a new run knows only the card toss', usable(r).join() === 'cards' && knows(r, 'cards') && !knows(r, 'wand'));
  ok('the plain card toss has stats', trickStats('cards', null).dmg === 1);
  ok('learning a trick takes', choosePath(r, 'wand', 'steer') && r.tricks.wand === 'steer');
  ok('a new trick lands on an empty button', r.equip.b === 'wand');
  ok('the path is permanent for the run', !choosePath(r, 'wand', 'homing') && r.tricks.wand === 'steer');
  ok('the card toss upgrade is a one-time choice too', choosePath(r, 'cards', 'fan') && !choosePath(r, 'cards', 'ace'));
  ok('made-up tricks and paths are refused', !choosePath(r, 'laser', 'big') && !choosePath(r, 'hat', 'nope'));
  ok('the steered wand hits harder than the hunting one', trickStats('wand', 'steer').dmg > trickStats('wand', 'homing').dmg);
  ok('the card shield is slow to come back; the storm is quick', trickStats('tornado', 'shield').cd > trickStats('tornado', 'storm').cd);
  const v = faceFrom(0.9, 0.95, { x: 0, y: 1 });
  ok('facing snaps to eight directions', Math.abs(v.x - Math.SQRT1_2) < 0.01 && Math.abs(v.y - Math.SQRT1_2) < 0.01);
  ok('a resting stick keeps the old facing', faceFrom(0.1, 0, { x: 1, y: 0 }).x === 1);
}

console.log('\nthe hat');
{
  ok('three layers down to Malvado', LAYERS.length === 3 && LAYERS[2].boss === 'malvado');
  ok('every boss and enemy is defined', LAYERS.every((L) => BOSSES[L.boss] && L.enemies.every((e) => ENEMIES[e])));
  const taught = LAYERS.flatMap((L) => L.spirits);
  ok('every trick is taught by exactly one spirit', taught.length === 6 && new Set(taught).size === 6 && taught.every((t) => TRICKS[t]));
  LAYERS.forEach((L, i) => {
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
    ok(`${L.name}: one spirit room per trick taught here`, lay.rooms.filter((r) => r.kind === 'spirit').length === L.spirits.length);
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
  ok('deeper layers bring more enemies', roomEnemies(r, 2, 0).length >= 5);
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
  ok('broken saves are refused', !validRun(null) && !validRun({}) && !validRun({ ...r, layer: 9 }) && !validRun({ ...r, hp: 0 }) && !validRun({ ...r, tricks: { cards: null, laser: 'x' } }) && !validRun({ ...r, equip: { a: 'wand', b: null } }));
  ok('an empty soul is a caught run, not a save', !validRun({ ...r, soul: 0 }));
  const before = r.maxHp;
  ok('beating a boss is not the end until Malvado', beatBoss(r) === false);
  ok('a boss gives a heart and heals you', r.maxHp === before + 2 && r.hp === r.maxHp);
  descend(r);
  ok('the ladder goes to the next layer\'s start', r.layer === 1 && r.room === layoutLayer(1).start);
  descend(r);
  r.beaten[2] = false;
  ok('beating Malvado ends the game', beatBoss(r) === true);
  ok('the name is kept as typed', newRun('cAmP').name === 'CAMP' && NAME_LEN === 4);
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
