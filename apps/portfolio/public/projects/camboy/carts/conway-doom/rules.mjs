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
export const FLOOR = 0, STONE = 1, EXIT = 2;

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
  const L = { w, h, title, tiles, cells: new Uint8Array(w * h), items: [], tips: [], start: null, exit: null };
  L.stone = (x, y, sw = 1, sh = 1) => { for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) tiles[yy * w + xx] = STONE; };
  L.floor = (x, y, sw = 1, sh = 1) => { for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) tiles[yy * w + xx] = FLOOR; };
  L.put = (rows, x, y, k = 0) => stamp(L.cells, w, orient(rows, k), x, y);
  L.pat = (name, x, y, k = 0) => L.put(PATTERNS[name].rows, x, y, k);
  L.item = (kind, x, y) => L.items.push({ kind, x, y });
  L.exitAt = (x, y) => { L.exit = { x, y }; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[(y + dy) * w + x + dx] = EXIT; };
  return L;
}

/** The hand-built levels, in order. Each is a function so the arrays are fresh every time. */
export const LEVELS = [
  // 1. Still lifes: blocks and beehives that stand still, filling the doorways.
  () => {
    const L = blank(40, 32, "STILL LIFE");
    L.stone(12, 1, 2, 30); L.floor(12, 15, 2, 2); L.pat("block", 12, 15);
    L.stone(22, 1, 2, 30); L.floor(22, 9, 2, 2); L.pat("block", 22, 9);
    L.stone(30, 1, 4, 30); L.floor(30, 20, 4, 3); L.pat("beehive", 30, 20);
    L.pat("block", 5, 6); L.pat("beehive", 16, 24); L.pat("loaf", 17, 5); L.pat("boat", 26, 26);
    L.start = { x: 4, y: 15 };
    L.exitAt(36, 15);
    L.item("ammo", 18, 15); L.item("seed", 27, 15);
    L.tips = [
      "THE WALLS HERE ARE ALIVE. EVERY TICK, EACH CELL LIVES OR DIES BY CONWAY'S GAME OF LIFE.",
      "A SHOOTS A CELL. BUT BLOCKS ARE TOUGH: SHOOT ONE CELL AND THE OTHER THREE GROW IT BACK. HOLD A TO SHOOT TWO AT ONCE!",
      "REACH THE CHECKERED EXIT.",
    ];
    return L;
  },
  // 2. Oscillators: blinkers, toads and beacons flap; a pulsar pounds in the middle room.
  () => {
    const L = blank(40, 48, "OSCILLATORS");
    L.stone(1, 14, 38, 2); L.floor(30, 14, 7, 2); L.pat("blinker", 32, 14);
    L.stone(1, 34, 38, 2); L.floor(3, 34, 7, 2); L.pat("blinker", 5, 34);
    L.pat("toad", 6, 5); L.pat("beacon", 18, 7); L.pat("toad", 26, 3); L.pat("blinker", 12, 10, 1);
    L.pat("pulsar", 13, 18);
    L.pat("beacon", 31, 22); L.pat("toad", 4, 27);
    L.pat("blinker", 14, 39); L.pat("blinker", 22, 39); L.pat("toad", 27, 43); L.pat("beacon", 8, 42);
    L.start = { x: 6, y: 3 };
    L.exitAt(34, 44);
    L.item("ammo", 20, 4); L.item("ammo", 34, 28); L.item("heart", 3, 20);
    L.tips = ["OSCILLATORS FLAP BACK AND FORTH EVERY TICK. SLIP PAST THEM, OR SHOOT THEM TO BITS."];
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
    L.item("ammo", 22, 30); L.item("seed", 40, 32);
    L.tips = ["GLIDERS CRAWL ACROSS THE FIELD, ONE CELL EVERY FOUR TICKS. THE EATERS IN THE CORNER SWALLOW THEM.", "B DROPS A SEED CELL. THREE SEEDS IN AN L GROW INTO A BLOCK!"];
    return L;
  },
  // 4. The gun: a glider gun fires down across the corridor, forever.
  () => {
    const L = blank(54, 40, "THE GUN");
    L.put(gunWithEater(10), 2, 2);
    L.stone(1, 19, 27, 1); L.stone(39, 19, 14, 1);          // the corridor's roof, open where the stream comes through
    L.stone(1, 29, 37, 1); L.stone(49, 29, 4, 1);           // its floor, open where the stream leaves
    L.stone(38, 30, 1, 9); L.stone(52, 30, 1, 9);           // the eater's pocket
    L.start = { x: 3, y: 24 };
    L.exitAt(49, 23);
    L.item("ammo", 20, 24); L.item("heart", 30, 21);
    L.tips = ["A GLIDER GUN! IT FIRES A NEW GLIDER EVERY THIRTY TICKS. TIME YOUR RUN ACROSS THE STREAM."];
    return L;
  },
  // 5. Soup: random cells, boiling away.
  () => {
    const L = blank(44, 32, "PRIMORDIAL SOUP");
    const rng = makeRng(1970);
    for (let y = 2; y < 30; y++) for (let x = 9; x < 35; x++) if (rng() < 0.32) L.cells[y * 44 + x] = 1;
    L.start = { x: 3, y: 15 };
    L.exitAt(39, 15);
    L.item("ammo", 6, 4); L.item("ammo", 6, 26); L.item("seed", 22, 1);
    L.tips = ["RANDOM SOUP. NOBODY KNOWS WHAT IT WILL TURN INTO. NOT EVEN CONWAY."];
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
    L.item("ammo", 30, 24); L.item("heart", 53, 40); L.item("ammo", 20, 56); L.item("seed", 53, 30);
    L.tips = ["TWO GUNS. GO RIGHT, DOWN THE SIDE, AND BACK LEFT UNDER THE SECOND ONE."];
    return L;
  },
];

/**
 * Beyond the hand-built levels: a fresh field every time, bigger as you
 * go, with stone pillars, still lifes and oscillators, and patches of soup.
 */
export function endlessLevel(n, seed) {
  const rng = makeRng((seed ^ (n * 7919)) >>> 0);
  const w = Math.min(64, 40 + n * 2), h = Math.min(48, 32 + n * 2);
  const L = blank(w, h, `FIELD ${n}`);
  const free = (x, y, sw, sh, pad = 1) => {
    for (let yy = y - pad; yy < y + sh + pad; yy++) for (let xx = x - pad; xx < x + sw + pad; xx++) {
      if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) return false;
      const i = yy * w + xx;
      if (L.tiles[i] || L.cells[i]) return false;
    }
    return true;
  };
  L.start = { x: 3, y: 3 + Math.floor(rng() * (h - 8)) };
  L.exitAt(w - 5, 3 + Math.floor(rng() * (h - 8)));
  const safe = (x, y, sw, sh) => Math.hypot(x - L.start.x, y - L.start.y) > 6 && Math.hypot(x - L.exit.x, y - L.exit.y) > 6;
  for (let i = 0; i < 4 + n; i++) {
    const sw = 2 + Math.floor(rng() * 5), sh = 2 + Math.floor(rng() * 5), x = 4 + Math.floor(rng() * (w - 12)), y = 2 + Math.floor(rng() * (h - 8));
    if (free(x, y, sw, sh, 2) && safe(x, y, sw, sh)) L.stone(x, y, sw, sh);
  }
  const kinds = ["block", "beehive", "loaf", "boat", "blinker", "toad", "beacon"];
  for (let i = 0; i < 10 + n * 2; i++) {
    const rows = orient(PATTERNS[kinds[Math.floor(rng() * kinds.length)]].rows, Math.floor(rng() * 8));
    const x = 3 + Math.floor(rng() * (w - 8)), y = 2 + Math.floor(rng() * (h - 6));
    if (free(x, y, rows[0].length, rows.length, 2) && safe(x, y)) L.put(rows, x, y);
  }
  for (let p = 0; p < 1 + Math.floor(n / 3); p++) {
    const x = 8 + Math.floor(rng() * (w - 24)), y = 3 + Math.floor(rng() * (h - 14));
    for (let yy = y; yy < y + 8; yy++) for (let xx = x; xx < x + 10; xx++) if (!L.tiles[yy * w + xx] && rng() < 0.33) L.cells[yy * w + xx] = 1;
  }
  for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(rng() * (w - 6)), y = 2 + Math.floor(rng() * (h - 4));
    if (!L.tiles[y * w + x] && !L.cells[y * w + x]) L.item(["ammo", "ammo", "heart", "seed"][Math.floor(rng() * 4)], x, y);
  }
  L.tips = n === 1 ? ["YOU MADE IT THROUGH THE LAB. FROM HERE ON, EVERY FIELD IS NEW."] : [];
  return L;
}

/** Level i (0 based): hand-built first, then endless fields. */
export function buildLevel(i, seed = 1) {
  const L = i < LEVELS.length ? LEVELS[i]() : endlessLevel(i - LEVELS.length + 1, seed);
  // Nothing grows on the start or under the items.
  for (const p of [L.start, ...L.items]) L.cells[p.y * L.w + p.x] = 0;
  return L;
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
      if (!seen[j] && tiles[j] !== STONE) { seen[j] = 1; q.push(j); }
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
  return L.tiles[i] === STONE || cells[i] === 1;
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
    if (dx && !hits(x + dx / n, y)) x += dx / n;
    if (dy && !hits(x, y + dy / n)) y += dy / n;
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
