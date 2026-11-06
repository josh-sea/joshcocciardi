/**
 * Conway's DOOM: rules. Camboy cartridge #4.
 *
 * Seen from above, you cross a field where the walls are alive: every
 * tick, the cells follow Conway's Game of Life. Still lifes stand like
 * walls, oscillators flap like doors, gliders drift across the room, and
 * glider guns keep firing them. Shoot a cell and it's gone, but the rest
 * of the pattern carries on, so a wall can grow back (shoot one cell of a
 * block and the three left make a new block next tick). Drop seed cells
 * to build your own. Get to the exit before the field gets you.
 *
 * This module holds the parts with no canvas or input: the Life engine,
 * the patterns, the levels and the save, so they can be tested in node.
 */

export const W = 160;
export const H = 144;
export const CELL = 4;           // pixels per cell
export const TOP = 16;           // the field sits under a 16 px status bar
export const VIEW_COLS = W / CELL;          // 40
export const VIEW_ROWS = (H - TOP) / CELL;  // 32

export const TICK = 0.32;        // seconds per generation
export const SPEED = 30;         // the hero, in pixels per second
export const HEARTS = 3;

/* Tiles under the cells. Stone never lives and never counts. The exit is kept clear. */
export const FLOOR = 0, STONE = 1, EXIT = 2, CORE = 4;

/* ---------- the Game of Life ---------- */

/**
 * One generation. cells and tiles are Uint8Arrays of w * h. A live cell
 * with two or three live neighbors lives; a dead one with exactly three
 * is born, but never on stone or the exit. Off the edge counts as dead.
 * Returns the new cells; `born` and `died` (optional arrays) collect what
 * changed, by index.
 */
export function step(cells, tiles, w, h, born = null, died = null) {
  const n = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!cells[row + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const Y = y + dy;
        if (Y < 0 || Y >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx;
          if ((dx || dy) && X >= 0 && X < w) n[Y * w + X]++;
        }
      }
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (cells[i]) {
      out[i] = n[i] === 2 || n[i] === 3 ? 1 : 0;
      if (!out[i] && died) died.push(i);
    } else if (n[i] === 3 && tiles[i] === FLOOR) {
      out[i] = 1;
      if (born) born.push(i);
    }
  }
  return out;
}

export const population = (cells) => cells.reduce((a, b) => a + b, 0);

/**
 * Where you shoot a cell, it leaves a scar: nothing can be born there for
 * the next SCAR_TICKS generations. So a block you shoot once stays a
 * broken L for a moment before it heals, and a second shot in that time
 * finishes it, without having to land both shots inside one tick.
 */
export const SCAR_TICKS = 2;
const SCAR = 3;
export function scarred(tiles, scars) {
  if (!scars.some((v) => v > 0)) return tiles;
  const t = tiles.slice();
  for (let i = 0; i < t.length; i++) if (scars[i] > 0 && t[i] === FLOOR) t[i] = SCAR;
  return t;
}

/* ---------- patterns ---------- */

/** Patterns as rows, "O" alive. Their names are what the field guide shows. */
export const PATTERNS = {
  block: { desc: "FOUR CELLS IN A SQUARE. EACH HAS THREE NEIGHBORS, SO IT NEVER CHANGES. SHOOT ONE CELL AND THE OTHER THREE GROW IT BACK!", name: "BLOCK", kind: "STILL LIFE", rows: ["OO", "OO"] },
  beehive: { desc: "A STILL LIFE SHAPED LIKE A HONEYCOMB. IT NEVER MOVES.", name: "BEEHIVE", kind: "STILL LIFE", rows: [".OO.", "O..O", ".OO."] },
  loaf: { desc: "A STILL LIFE. IT LOOKS A BIT LIKE A LOAF OF BREAD, IF YOU SQUINT.", name: "LOAF", kind: "STILL LIFE", rows: [".OO.", "O..O", ".O.O", "..O."] },
  boat: { desc: "THE SMALLEST STILL LIFE WITH FIVE CELLS.", name: "BOAT", kind: "STILL LIFE", rows: ["OO.", "O.O", ".O."] },
  blinker: { desc: "THREE IN A ROW. IT FLIPS BETWEEN LYING DOWN AND STANDING UP EVERY TICK.", name: "BLINKER", kind: "OSCILLATOR", rows: ["OOO"] },
  toad: { desc: "TWO ROWS OF THREE THAT WIGGLE BACK AND FORTH EVERY TICK.", name: "TOAD", kind: "OSCILLATOR", rows: [".OOO", "OOO."] },
  beacon: { desc: "TWO BLOCKS TOUCHING AT THE CORNER. THE MIDDLE CELLS BLINK ON AND OFF.", name: "BEACON", kind: "OSCILLATOR", rows: ["OO..", "OO..", "..OO", "..OO"] },
  pulsar: {
    desc: "A BIG FLOWER OF CELLS THAT REPEATS EVERY THREE TICKS.",
    name: "PULSAR", kind: "OSCILLATOR",
    rows: [
      "..OOO...OOO..",
      ".............",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      "..OOO...OOO..",
      ".............",
      "..OOO...OOO..",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      ".............",
      "..OOO...OOO..",
    ],
  },
  glider: { desc: "FIVE CELLS THAT WALK DIAGONALLY, ONE CELL EVERY FOUR TICKS. FOUND BY RICHARD GUY IN 1970.", name: "GLIDER", kind: "SPACESHIP", rows: [".O.", "..O", "OOO"] },
  lwss: { desc: "A LITTLE SHIP THAT FLIES SIDEWAYS, ONE CELL EVERY TWO TICKS.", name: "LIGHTWEIGHT SPACESHIP", kind: "SPACESHIP", rows: [".O..O", "O....", "O...O", "OOOO."] },
  gun: {
    desc: "BILL GOSPER'S GLIDER GUN, 1970. IT FIRES A NEW GLIDER EVERY THIRTY TICKS, FOREVER.",
    name: "GLIDER GUN", kind: "GUN",
    rows: [
      "........................O...........",
      "......................O.O...........",
      "............OO......OO............OO",
      "...........O...O....OO............OO",
      "OO........O.....O...OO..............",
      "OO........O...O.OO....O.O...........",
      "..........O.....O.......O...........",
      "...........O...O....................",
      "............OO......................",
    ],
  },
  eater: { desc: "A STILL LIFE THAT SWALLOWS A GLIDER AND FIXES ITSELF RIGHT AFTER.", name: "EATER", kind: "STILL LIFE", rows: ["OO..", "O.O.", "..O.", "..OO"] },
};

const rotate = (rows) => [...rows[0]].map((_, x) => rows.map((r) => r[x]).reverse().join(""));
const mirror = (rows) => rows.map((r) => [...r].reverse().join(""));

/** A pattern turned: k = 0-3 quarter turns clockwise, plus 4 to mirror it first. */
export function orient(rows, k = 0) {
  let r = k >= 4 ? mirror(rows) : rows.slice();
  for (let i = 0; i < k % 4; i++) r = rotate(r);
  return r;
}

/** Stamp rows into cells at (x, y). */
export function stamp(cells, w, rows, x, y) {
  rows.forEach((row, dy) => [...row].forEach((c, dx) => { if (c === "O") cells[(y + dy) * w + x + dx] = 1; }));
}

/**
 * A glider gun with an eater at the end of its stream, so the gliders it
 * fires get swallowed instead of piling up. n is how many cells further
 * down the lane the eater sits (found by simulation; see the tests).
 * Returns rows, to orient and stamp like any other pattern.
 */
export function gunWithEater(n = 10) {
  const w = 34 + n + 4, h = 20 + n + 4;
  const grid = Array.from({ length: h }, () => Array(w).fill("."));
  const put = (rows, x, y) => rows.forEach((r, dy) => [...r].forEach((c, dx) => { if (c === "O") grid[y + dy][x + dx] = "O"; }));
  put(PATTERNS.gun.rows, 0, 0);
  put(PATTERNS.eater.rows, 34 + n, 20 + n);
  return grid.map((r) => r.join(""));
}

/** A lone glider heading down-right, with an eater waiting n cells down its path. */
export function gliderWithEater(n = 8) {
  const w = 4 + n + 4, h = 3 + n + 4;
  const grid = Array.from({ length: h }, () => Array(w).fill("."));
  const put = (rows, x, y) => rows.forEach((r, dy) => [...r].forEach((c, dx) => { if (c === "O") grid[y + dy][x + dx] = "O"; }));
  put(["O.O", ".OO", ".O."], 0, 0);
  put(PATTERNS.eater.rows, 4 + n, 3 + n);
  return grid.map((r) => r.join(""));
}

/* ---------- levels ---------- */

/** A small seeded generator, so a level comes out the same every time. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A blank level: stone all round the edge. */
function blank(w, h, title) {
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!x || !y || x === w - 1 || y === h - 1) tiles[y * w + x] = STONE;
  const L = { w, h, title, tiles, cells: new Uint8Array(w * h), items: [], tips: [], cores: [], start: null, exit: null, tick: TICK };
  L.stone = (x, y, sw = 1, sh = 1) => { for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) tiles[yy * w + xx] = STONE; };
  L.floor = (x, y, sw = 1, sh = 1) => { for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) tiles[yy * w + xx] = FLOOR; };
  L.put = (rows, x, y, k = 0) => stamp(L.cells, w, orient(rows, k), x, y);
  L.pat = (name, x, y, k = 0) => L.put(PATTERNS[name].rows, x, y, k);
  L.item = (kind, x, y) => L.items.push({ kind, x, y });
  L.exitAt = (x, y) => { L.exit = { x, y }; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[(y + dy) * w + x + dx] = EXIT; };
  /** A core: a 2x2 machine that keeps feeding new patterns into the field. */
  L.core = (x, y, every = 18) => {
    L.cores.push({ x, y, hp: CORE_HP, every, t: Math.floor(every / 2) });
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[(y + dy) * w + x + dx] = CORE;
  };
  /** Is this box of floor empty, with `pad` empty cells around it? */
  L.free = (x, y, sw, sh, pad = 1) => {
    for (let yy = y - pad; yy < y + sh + pad; yy++) for (let xx = x - pad; xx < x + sw + pad; xx++) {
      if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) return false;
      const i = yy * w + xx;
      if (tiles[i] || L.cells[i]) return false;
    }
    return true;
  };
  /**
   * A grove: blocks in a grid with one empty cell between them. Every gap
   * cell has four neighbors, so nothing is born and the whole thing stands
   * still, until something crashes into it. Some blocks are left out, so
   * there are ways through. Stays clear of the start, exit, items and cores.
   */
  L.grove = (rng, x0, y0, gw, gh, density = 0.7, keepOut = () => false) => {
    const cols = Math.floor((gw + 1) / 3), rows = Math.floor((gh + 1) / 3);
    // Whole rows and columns of blocks are left out, which makes streets
    // through the grove and never leaves three blocks round a corner.
    const rowOn = Array.from({ length: rows }, () => rng() <= density);
    const colOn = Array.from({ length: cols }, () => rng() <= density);
    // Which spots could hold a block at all (not too close to the start, exit, items, cores or other life).
    const allowed = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * 3, y = y0 + r * 3;
      let ok = (Math.abs(x - L.start.x) > 3 || Math.abs(y - L.start.y) > 3) && (!L.exit || Math.abs(x - L.exit.x) > 3 || Math.abs(y - L.exit.y) > 3);
      for (let yy = y - 2; yy <= y + 3 && ok; yy++) for (let xx = x - 2; xx <= x + 3 && ok; xx++) {
        const inBlock = xx >= x && xx <= x + 1 && yy >= y && yy <= y + 1;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) { if (inBlock) ok = false; continue; }
        const i = yy * w + xx;
        // Stone right next to a block is fine (nothing is ever born on stone); other live cells need room.
        if (inBlock && tiles[i]) ok = false;
        if (tiles[i] === EXIT || tiles[i] === CORE || keepOut(xx, yy)) ok = false;
        if (L.cells[i] && (xx < x0 - 1 || yy < y0 - 1 || xx > x0 + gw || yy > y0 + gh)) ok = false;
      }
      if (ok && L.items.some((it) => Math.abs(it.x - x - 0.5) < 3 && Math.abs(it.y - y - 0.5) < 3)) ok = false;
      if (ok && L.cores.some((k) => Math.abs(k.x - x) < 5 && Math.abs(k.y - y) < 5)) ok = false;
      allowed[r][c] = ok;
    }
    // A gap cell where four blocks meet has four neighbors; with exactly three
    // round it, a cell is born. Blocks only stand where their whole row and
    // whole column are on, so that can't happen: where a spot isn't allowed,
    // drop its row or its column, whichever loses fewer blocks.
    for (let changed = true; changed;) {
      changed = false;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!rowOn[r] || !colOn[c] || allowed[r][c]) continue;
        const inRow = colOn.filter(Boolean).length, inCol = rowOn.filter(Boolean).length;
        if (inRow <= inCol) rowOn[r] = false; else colOn[c] = false;
        changed = true;
      }
    }
    const on = rowOn.map((ro) => colOn.map((co) => ro && co));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (on[r][c]) stamp(L.cells, w, PATTERNS.block.rows, x0 + c * 3, y0 + r * 3);
  };
  /**
   * Scatter n patterns over the empty floor, each with room to live, away
   * from the start, the exit, the items, the cores and anywhere `keepOut`
   * says (gun lanes). This is what fills the empty space.
   */
  L.sprinkle = (rng, n, kinds, keepOut = () => false) => {
    const near = (x, y, sw, sh, p, r) => x - r < p.x + 2 && p.x - r < x + sw && y - r < p.y + 2 && p.y - r < y + sh;
    for (let tries = 0, placed = 0; placed < n && tries < n * 60; tries++) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const rows = orient(PATTERNS[kind].rows, Math.floor(rng() * 8));
      const sw = rows[0].length, sh = rows.length;
      const x = 2 + Math.floor(rng() * (w - sw - 3)), y = 2 + Math.floor(rng() * (h - sh - 3));
      // Room all round, so neighbors never breed into each other: two cells
      // for still lifes, three for flappers, which stick out a cell when they flip.
      if (!L.free(x, y, sw, sh, STILL.includes(kind) ? 2 : 3)) continue;
      if (near(x, y, sw, sh, L.start, 4) || near(x, y, sw, sh, L.exit, 3) || L.items.some((it) => near(x, y, sw, sh, it, 2)) || L.cores.some((c) => near(x, y, sw, sh, c, 3))) continue;
      let bad = false;
      for (let yy = y - 1; yy <= y + sh && !bad; yy++) for (let xx = x - 1; xx <= x + sw && !bad; xx++) if (keepOut(xx, yy)) bad = true;
      if (bad) continue;
      L.put(rows, x, y);
      placed++;
    }
  };
  return L;
}

const STILL = ["block", "beehive", "loaf", "boat"];
const MIXED = ["block", "beehive", "loaf", "boat", "blinker", "toad", "beacon"];

/** The hand-built levels, in order. Each is a function so the arrays are fresh every time. */
export const LEVELS = [
  // 1. Still lifes: blocks and beehives that stand still, filling the doorways, and lots of clutter.
  () => {
    const L = blank(40, 32, "STILL LIFE");
    L.stone(12, 1, 2, 30); L.floor(12, 15, 2, 2); L.pat("block", 12, 15);
    L.stone(22, 1, 2, 30); L.floor(22, 9, 2, 2); L.pat("block", 22, 9);
    L.stone(30, 1, 4, 30); L.floor(30, 20, 4, 3); L.pat("beehive", 30, 20);
    L.start = { x: 4, y: 15 };
    L.exitAt(36, 15);
    L.item("ammo", 18, 15); L.item("seed", 27, 15);
    const g1 = makeRng(12);
    L.grove(g1, 2, 2, 9, 11, 0.75); L.grove(g1, 2, 19, 9, 11, 0.75); L.grove(g1, 15, 2, 6, 28, 0.7); L.grove(g1, 25, 2, 4, 28, 0.7);
    L.sprinkle(makeRng(11), 60, STILL);
    L.tips = [
      "THE WALLS HERE ARE ALIVE. EVERY TICK, EACH CELL LIVES OR DIES BY CONWAY'S GAME OF LIFE.",
      "A SHOOTS A CELL. BUT BLOCKS ARE TOUGH: SHOOT ONE CELL AND THE OTHER THREE GROW IT BACK. SHOOT TWICE, QUICK!",
      "REACH THE CHECKERED EXIT.",
    ];
    return L;
  },
  // 2. Oscillators, and the first cores.
  () => {
    const L = blank(40, 48, "OSCILLATORS");
    L.stone(1, 14, 38, 2); L.floor(30, 14, 7, 2); L.pat("blinker", 32, 14);
    L.stone(1, 34, 38, 2); L.floor(3, 34, 7, 2); L.pat("blinker", 5, 34);
    L.pat("pulsar", 13, 18);
    L.start = { x: 6, y: 3 };
    L.exitAt(34, 44);
    L.item("ammo", 20, 4); L.item("ammo", 34, 28); L.item("heart", 3, 20); L.item("ammo", 20, 40);
    L.core(30, 6, 20); L.core(14, 40, 18);
    const g2 = makeRng(23);
    L.grove(g2, 10, 2, 16, 10, 0.6); L.grove(g2, 22, 37, 15, 9, 0.6); L.grove(g2, 30, 19, 8, 13, 0.6);
    L.sprinkle(makeRng(22), 60, MIXED, (x, y) => x >= 11 && x <= 28 && y >= 16 && y <= 32);
    L.tips = [
      "OSCILLATORS FLAP BACK AND FORTH EVERY TICK. SLIP PAST THEM, OR SHOOT THEM TO BITS.",
      "THAT PULSING SQUARE IS A CORE. IT KEEPS SPITTING NEW PATTERNS INTO THE FIELD, FASTER AND FASTER. EIGHT SHOTS BREAK IT.",
    ];
    return L;
  },
  // 3. Gliders: little ships that walk across the room, each into an eater.
  () => {
    const L = blank(44, 40, "GLIDERS");
    // Parallel lanes, each glider with its own eater, spaced so no stream crosses another's eater.
    L.put(gliderWithEater(26), 2, 2);
    L.put(gliderWithEater(20), 10, 2);
    L.put(gliderWithEater(14), 18, 2);
    L.stone(30, 3, 2, 8); L.stone(8, 26, 8, 2);
    L.start = { x: 3, y: 34 };
    L.exitAt(39, 3);
    L.item("ammo", 22, 30); L.item("seed", 40, 32); L.item("ammo", 6, 20);
    L.core(14, 32, 16);
    const lane3 = (x, y) => (x - y >= -5 && x - y <= 22 && y <= 37) || (x >= 30 && y >= 17);
    L.grove(makeRng(34), 2, 14, 22, 24, 0.8, lane3); L.grove(makeRng(35), 24, 2, 18, 14, 0.8, lane3);
    // Keep the glider lanes and their eaters clear.
    L.sprinkle(makeRng(33), 50, MIXED, (x, y) => (x - y >= -5 && x - y <= 22 && y <= 37) || (x >= 30 && y >= 17));
    L.tips = ["GLIDERS CRAWL ACROSS THE FIELD, ONE CELL EVERY FOUR TICKS. THE EATERS SWALLOW THEM.", "B DROPS A SEED CELL. THREE SEEDS IN AN L GROW INTO A BLOCK!"];
    return L;
  },
  // 4. The gun: a glider gun fires down across the corridor, forever. A core guards the corridor.
  () => {
    const L = blank(54, 40, "THE GUN");
    L.put(gunWithEater(10), 2, 2);
    L.stone(1, 19, 27, 1); L.stone(39, 19, 14, 1);          // the corridor's roof, open where the stream comes through
    L.stone(1, 29, 37, 1); L.stone(49, 29, 4, 1);           // its floor, open where the stream leaves
    L.stone(38, 30, 1, 9); L.stone(52, 30, 1, 9);           // the eater's pocket
    L.start = { x: 3, y: 24 };
    L.exitAt(49, 23);
    L.item("ammo", 20, 24); L.item("heart", 30, 21); L.item("ammo", 10, 27);
    L.core(22, 23, 16); L.core(46, 13, 16);
    const lane4 = (x, y) => x - y >= 6 && x - y <= 24;
    L.grove(makeRng(45), 41, 2, 11, 16, 0.65); L.grove(makeRng(46), 6, 20, 30, 9, 0.8, lane4); L.grove(makeRng(47), 38, 20, 14, 9, 0.8, lane4);
    L.sprinkle(makeRng(44), 50, MIXED, (x, y) => (x < 40 && y < 13) || (x - y >= 6 && x - y <= 24) || y > 28);
    L.tips = ["A GLIDER GUN! IT FIRES A NEW GLIDER EVERY THIRTY TICKS. TIME YOUR RUN ACROSS THE STREAM."];
    return L;
  },
  // 5. Soup: random cells, boiling away, and cores stirring it.
  () => {
    const L = blank(44, 32, "PRIMORDIAL SOUP");
    const rng = makeRng(1970);
    for (let y = 2; y < 30; y++) for (let x = 7; x < 37; x++) if (rng() < 0.4) L.cells[y * 44 + x] = 1;
    L.start = { x: 3, y: 15 };
    L.exitAt(39, 15);
    L.item("ammo", 3, 4); L.item("ammo", 3, 26); L.item("seed", 40, 3);
    L.core(20, 6, 14); L.core(24, 24, 14);
    for (const c of L.cores) for (let dy = -1; dy < 3; dy++) for (let dx = -1; dx < 3; dx++) L.cells[(c.y + dy) * 44 + c.x + dx] = 0;
    L.tips = ["RANDOM SOUP, AND CORES STIRRING IT. NOBODY KNOWS WHAT IT WILL TURN INTO. NOT EVEN CONWAY."];
    return L;
  },
  // 6. Two guns, two corridors.
  () => {
    const L = blank(56, 68, "TWO GUNS");
    L.put(gunWithEater(10), 2, 2);
    L.stone(1, 19, 27, 1); L.stone(39, 19, 13, 1);
    L.stone(1, 29, 37, 1); L.stone(49, 29, 3, 1);
    L.stone(38, 30, 1, 8); L.stone(51, 30, 1, 8); L.stone(38, 37, 14, 1);
    L.put(gunWithEater(6), 2, 34);
    L.stone(1, 51, 27, 1); L.stone(39, 51, 13, 1);
    L.stone(1, 61, 31, 1); L.stone(45, 61, 7, 1);
    L.stone(51, 1, 1, 18); L.stone(51, 38, 1, 13);
    L.start = { x: 3, y: 24 };
    L.exitAt(3, 56);
    L.item("ammo", 30, 24); L.item("heart", 53, 40); L.item("ammo", 20, 56); L.item("seed", 53, 30); L.item("ammo", 53, 10);
    L.core(14, 23, 15); L.core(18, 55, 15); L.core(52, 44, 16);
    L.grove(makeRng(67), 52, 2, 3, 64, 0.5); L.grove(makeRng(68), 39, 39, 11, 11, 0.6);
    const lane6 = (x, y) => (y <= 38 && x - y >= 4 && x - y <= 24) || (y >= 50 && x - (y - 32) >= 4 && x - (y - 32) <= 24);
    L.grove(makeRng(69), 6, 20, 44, 9, 0.8, lane6); L.grove(makeRng(70), 6, 52, 44, 9, 0.8, lane6);
    const lanes = (x, y) => (y < 20 && x < 40) || (y >= 30 && y < 52 && x < 40) || (y >= 19 && y <= 38 && x - y >= 4 && x - y <= 24) || (y >= 51 && x - (y - 32) >= 4 && x - (y - 32) <= 24);
    L.sprinkle(makeRng(66), 70, MIXED, lanes);
    L.tips = ["TWO GUNS. GO RIGHT, DOWN THE SIDE, AND BACK LEFT UNDER THE SECOND ONE."];
    return L;
  },
];

/**
 * Beyond the hand-built levels: a fresh field every time, bigger and
 * busier as you go: stone pillars, thick with still lifes and
 * oscillators, patches of soup, more cores, and a faster clock.
 */
export function endlessLevel(n, seed) {
  const rng = makeRng((seed ^ (n * 7919)) >>> 0);
  const w = Math.min(64, 40 + n * 2), h = Math.min(48, 32 + n * 2);
  const L = blank(w, h, `FIELD ${n}`);
  L.tick = Math.max(0.2, TICK - n * 0.012);
  L.start = { x: 3, y: 3 + Math.floor(rng() * (h - 8)) };
  L.exitAt(w - 5, 3 + Math.floor(rng() * (h - 8)));
  const far = (x, y) => Math.hypot(x - L.start.x, y - L.start.y) > 7 && Math.hypot(x - L.exit.x, y - L.exit.y) > 6;
  for (let i = 0; i < 6 + n; i++) {
    const sw = 2 + Math.floor(rng() * 5), sh = 2 + Math.floor(rng() * 5), x = 4 + Math.floor(rng() * (w - 12)), y = 2 + Math.floor(rng() * (h - 8));
    if (L.free(x, y, sw, sh, 2) && far(x, y)) L.stone(x, y, sw, sh);
  }
  for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(rng() * (w - 6)), y = 2 + Math.floor(rng() * (h - 4));
    if (!L.tiles[y * w + x]) L.item(["ammo", "ammo", "heart", "seed"][Math.floor(rng() * 4)], x, y);
  }
  for (let c = 0, tries = 0; c < Math.min(5, 1 + Math.floor(n / 2)) && tries < 80; tries++) {
    const x = 8 + Math.floor(rng() * (w - 18)), y = 3 + Math.floor(rng() * (h - 8));
    if (L.free(x, y, 2, 2, 3) && far(x, y) && L.cores.every((k) => Math.hypot(k.x - x, k.y - y) > 10)) { L.core(x, y, Math.max(10, 18 - n)); c++; }
  }
  for (let p = 0; p < 2 + Math.floor(n / 2); p++) {
    const x = 8 + Math.floor(rng() * (w - 24)), y = 3 + Math.floor(rng() * (h - 14));
    for (let yy = y; yy < y + 10; yy++) for (let xx = x; xx < x + 12; xx++) {
      const i = yy * w + xx;
      if (!L.tiles[i] && far(xx, yy) && rng() < 0.38 && !L.items.some((it) => Math.abs(it.x - xx) < 2 && Math.abs(it.y - yy) < 2)) L.cells[i] = 1;
    }
  }
  for (let g = 0; g < 2 + Math.floor(n / 2); g++) {
    const gw = 8 + Math.floor(rng() * 10), gh = 6 + Math.floor(rng() * 8);
    L.grove(rng, 3 + Math.floor(rng() * (w - gw - 6)), 2 + Math.floor(rng() * (h - gh - 4)), gw, gh, 0.55 + Math.min(0.25, n * 0.03));
  }
  L.sprinkle(rng, 50 + n * 6, MIXED);
  L.tips = n === 1 ? ["YOU MADE IT THROUGH THE LAB. FROM HERE ON, EVERY FIELD IS NEW, AND EVERY ONE IS HARDER."] : [];
  return L;
}

/** Level i (0 based): hand-built first, then endless fields. */
export function buildLevel(i, seed = 1) {
  const L = i < LEVELS.length ? LEVELS[i]() : endlessLevel(i - LEVELS.length + 1, seed);
  // Nothing grows on the start or under the items.
  for (const p of [L.start, ...L.items]) L.cells[p.y * L.w + p.x] = 0;
  // The cores stop feeding once the field is this full, so it never chokes completely.
  let open = 0;
  for (let k = 0; k < L.tiles.length; k++) if (L.tiles[k] === FLOOR) open++;
  L.cap = Math.max(population(L.cells) + 40, Math.round(open * 0.16));
  return L;
}

/* ---------- cores ---------- */

export const CORE_HP = 8;

/** What a core can spit out: mostly small things, sometimes a glider. */
export const CORE_SPAWNS = ["block", "beehive", "blinker", "toad", "boat", "glider", "glider", "blob"];

/** How many ticks between a core's spawns: it speeds up the longer you take, down to every 6. */
export const coreEvery = (core, gen) => Math.max(6, core.every - Math.floor(gen / 45));

/**
 * One spawn from a core, into the ring 3 to 6 cells around it. Gliders
 * fly away from the core, half the time toward the hero's side. Nothing
 * lands within 3 cells of the hero, on anything but empty floor, or past
 * the field's cap. Returns the stamped cell indices, or null.
 */
export function coreSpawn(L, cells, core, rng, hero, gen = 0) {
  if (population(cells) >= L.cap) return null;
  const kind = CORE_SPAWNS[Math.floor(rng() * CORE_SPAWNS.length)];
  for (let tries = 0; tries < 10; tries++) {
    const a = rng() * Math.PI * 2, r = 3 + rng() * 3;
    const cx = core.x + 1 + Math.cos(a) * r, cy = core.y + 1 + Math.sin(a) * r;
    let rows;
    if (kind === "blob") rows = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => (rng() < 0.55 ? "O" : ".")).join(""));
    else if (kind === "glider") {
      // The base glider heads down-right; turn it to head away from the core, or at the hero.
      const toward = hero && rng() < 0.5;
      const dx = toward ? hero.x - cx : cx - core.x - 1, dy = toward ? hero.y - cy : cy - core.y - 1;
      const k = dx >= 0 ? (dy >= 0 ? 0 : 3) : dy >= 0 ? 1 : 2; // 0 down-right, 1 down-left, 2 up-left, 3 up-right
      rows = orient(PATTERNS.glider.rows, k);
    } else rows = orient(PATTERNS[kind].rows, Math.floor(rng() * 8));
    const x = Math.round(cx - rows[0].length / 2), y = Math.round(cy - rows.length / 2);
    let ok = true;
    const put = [];
    rows.forEach((row, dy) => [...row].forEach((c, dx) => {
      const X = x + dx, Y = y + dy;
      if (X < 1 || Y < 1 || X >= L.w - 1 || Y >= L.h - 1) { ok = false; return; }
      const i = Y * L.w + X;
      if (L.tiles[i] !== FLOOR) ok = false;
      if (hero && Math.abs(X - hero.x) < 4 && Math.abs(Y - hero.y) < 4) ok = false;
      if (c === "O") put.push(i);
    }));
    if (!ok || !put.length) continue;
    for (const i of put) cells[i] = 1;
    return put;
  }
  return null;
}

/**
 * Can you get from the start to the exit at all, if you shoot what's in
 * the way? Stone is the only thing that truly blocks.
 */
export function canFinish(L) {
  const { w, h, tiles } = L;
  const seen = new Uint8Array(w * h);
  const q = [L.start.y * w + L.start.x];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    if (tiles[i] === EXIT) return true;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = Y * w + X;
      if (!seen[j] && tiles[j] !== STONE && tiles[j] !== CORE) { seen[j] = 1; q.push(j); }
    }
  }
  return false;
}

/* ---------- moving about ---------- */

/** Is a pixel blocked by stone or a live cell? Off the field is blocked. */
export function blockedAt(L, cells, px, py) {
  const x = Math.floor(px / CELL), y = Math.floor(py / CELL);
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return true;
  const i = y * L.w + x;
  return L.tiles[i] === STONE || L.tiles[i] === CORE || cells[i] === 1;
}

/** The cells a box (left, top, size s pixels) covers, by index. */
export function boxCells(L, x, y, s) {
  const out = [];
  for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + s - 0.01) / CELL); cy++)
    for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + s - 0.01) / CELL); cx++)
      if (cx >= 0 && cy >= 0 && cx < L.w && cy < L.h) out.push(cy * L.w + cx);
  return out;
}

/** Slide a square box by (dx, dy), one axis at a time, in small steps, stopping at anything solid. */
export function moveBox(L, cells, box, dx, dy) {
  let { x, y } = box;
  const s = box.s;
  const hits = (X, Y) => blockedAt(L, cells, X, Y) || blockedAt(L, cells, X + s - 0.01, Y) || blockedAt(L, cells, X, Y + s - 0.01) || blockedAt(L, cells, X + s - 0.01, Y + s - 0.01);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 1));
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sy = dy / n;
    if (sx) {
      if (!hits(x + sx, y)) x += sx;
      else if (!sy) {
        // Nearly lined up with a gap? Slip round the corner instead of sticking.
        for (const off of [1, -1, 2, -2]) if (!hits(x + sx, y + off) && !hits(x, y + Math.sign(off) * 0.5)) { y += Math.sign(off) * 0.5; break; }
      }
    }
    if (sy) {
      if (!hits(x, y + sy)) y += sy;
      else if (!sx) {
        for (const off of [1, -1, 2, -2]) if (!hits(x + off, y + sy) && !hits(x + Math.sign(off) * 0.5, y)) { x += Math.sign(off) * 0.5; break; }
      }
    }
  }
  return { ...box, x, y };
}

/** Four-way facing from a stick, keeping the old facing near a diagonal (as in Dark Hat). */
export function faceFrom(x, y, prev) {
  const m = Math.hypot(x, y);
  if (m < 0.3) return prev;
  const ax = Math.abs(x), ay = Math.abs(y);
  if (Math.abs(ax - ay) < 0.25 * m) {
    if (prev.x && Math.sign(prev.x) === Math.sign(x)) return prev;
    if (prev.y && Math.sign(prev.y) === Math.sign(y)) return prev;
  }
  return ax >= ay ? { x: Math.sign(x), y: 0 } : { x: 0, y: Math.sign(y) };
}

/* ---------- the save ---------- */

/** Progress: the furthest level reached, and a seed for the endless fields. */
export function validSave(s) {
  return !!s && Number.isInteger(s.level) && s.level >= 0 && s.level < 999 && Number.isInteger(s.seed);
}
