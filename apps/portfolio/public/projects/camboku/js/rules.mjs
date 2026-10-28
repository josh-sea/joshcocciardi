/* Camboku: the puzzle rules, the level generator and the logic solver.
 *
 * A board is n by n, carved into n colored regions. The answer puts one face
 * in every row, every column and every region, and no two faces touch, not
 * even at the corners.
 *
 * Levels are generated, not stored. generate() lays down a valid answer,
 * grows the regions out from it, then reshapes the borders until that answer
 * is the only one. Last, deduce() plays the puzzle the way a person would,
 * one rule at a time, and the level is kept only if it can be finished that
 * way without guessing. The hardest rule it needed is the level's tier.
 *
 * Everything here is pure (no DOM), so it runs the same in the browser and
 * under node for the tests.
 */

// Tiers of the rules deduce() knows, easiest first.
export const TIER = { SINGLE: 1, SQUEEZE: 2, PIGEONHOLE: 3, DEAD_END: 4 };

// ── Random numbers ──────────────────────────────────────────────────────────
// A seeded generator, so level 12 is the same board on every phone.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
function shuffle(rand, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ── Geometry ────────────────────────────────────────────────────────────────
export const rowOf = (n, cell) => Math.floor(cell / n);
export const colOf = (n, cell) => cell % n;

export function touching(n, cell) {
  const r = rowOf(n, cell), c = colOf(n, cell), out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}

function sides(n, cell) {
  const r = rowOf(n, cell), c = colOf(n, cell), out = [];
  if (r > 0) out.push(cell - n);
  if (r < n - 1) out.push(cell + n);
  if (c > 0) out.push(cell - 1);
  if (c < n - 1) out.push(cell + 1);
  return out;
}

// Every cell a face at `cell` rules out: its row, column, region and the
// eight cells around it.
export function blockedBy(n, regions, cell) {
  const r = rowOf(n, cell), c = colOf(n, cell), g = regions[cell], out = new Set(touching(n, cell));
  for (let i = 0; i < n * n; i++) {
    if (i !== cell && (rowOf(n, i) === r || colOf(n, i) === c || regions[i] === g)) out.add(i);
  }
  return [...out];
}

// Which placed faces break a rule. Used to double check a finished board.
export function conflicts(n, regions, stars) {
  const bad = new Set();
  for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) {
    const a = stars[i], b = stars[j];
    const sameLine = rowOf(n, a) === rowOf(n, b) || colOf(n, a) === colOf(n, b);
    const near = Math.abs(rowOf(n, a) - rowOf(n, b)) <= 1 && Math.abs(colOf(n, a) - colOf(n, b)) <= 1;
    if (sameLine || near || regions[a] === regions[b]) { bad.add(a); bad.add(b); }
  }
  return [...bad];
}

export function isSolved(n, regions, stars) {
  return stars.length === n && conflicts(n, regions, stars).length === 0;
}

// ── Counting answers ────────────────────────────────────────────────────────
// Row by row backtracking. Faces in the same row can't happen, so the only
// touching to check is against the row above. Stops once `limit` answers are
// found; the generator only ever needs to know "one" or "more than one".
export function solutions(n, regions, limit = 2) {
  const found = [], cols = [];
  let usedCols = 0, usedRegions = 0;
  (function row(r) {
    if (found.length >= limit) return;
    if (r === n) { found.push(cols.map((c, i) => i * n + c)); return; }
    for (let c = 0; c < n; c++) {
      const g = regions[r * n + c];
      if (usedCols & (1 << c) || usedRegions & (1 << g)) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      cols[r] = c; usedCols |= 1 << c; usedRegions |= 1 << g;
      row(r + 1);
      usedCols &= ~(1 << c); usedRegions &= ~(1 << g);
      if (found.length >= limit) return;
    }
  })(0);
  return found;
}

// ── The logic solver ────────────────────────────────────────────────────────
// A board in progress: which cells could still hold a face, and the faces
// placed so far. Units are the 3n lines a face must appear in once: rows are
// 0..n-1, columns n..2n-1, regions 2n..3n-1.
export function units(n, regions) {
  const u = Array.from({ length: 3 * n }, () => []);
  for (let i = 0; i < n * n; i++) {
    u[rowOf(n, i)].push(i);
    u[n + colOf(n, i)].push(i);
    u[2 * n + regions[i]].push(i);
  }
  return u;
}

export function newBoard(n, regions) {
  return { n, regions, units: units(n, regions), open: new Uint8Array(n * n).fill(1), stars: [] };
}

function cloneBoard(b) {
  return { ...b, open: b.open.slice(), stars: b.stars.slice() };
}

const unitsOf = (b, cell) => [rowOf(b.n, cell), b.n + colOf(b.n, cell), 2 * b.n + b.regions[cell]];
const unitDone = (b, u) => b.stars.some(s => b.units[u].includes(s));
const openIn = (b, u) => b.units[u].filter(i => b.open[i]);

export function place(b, cell) {
  b.stars.push(cell);
  b.open[cell] = 0;
  for (const i of blockedBy(b.n, b.regions, cell)) b.open[i] = 0;
}

// A board that can no longer be finished: some unit has no face and nowhere
// left to put one, or two faces clash.
function broken(b) {
  for (let u = 0; u < b.units.length; u++) {
    if (!unitDone(b, u) && openIn(b, u).length === 0) return true;
  }
  return conflicts(b.n, b.regions, b.stars).length > 0;
}

function subsets(list, k, fn) {
  const chosen = [];
  (function go(start) {
    if (chosen.length === k) return fn(chosen);
    for (let i = start; i < list.length; i++) {
      chosen.push(list[i]);
      if (go(i + 1)) return true;
      chosen.pop();
    }
  })(0);
}

// The next thing a person could work out from this board, using rules up to
// `maxTier`. Returns null when stuck. A step either places a face or clears
// cells, and carries what the hint bubble needs to explain itself.
export function nextStep(b, maxTier = TIER.DEAD_END) {
  const { n } = b;
  const kind = u => (u < n ? 'row' : u < 2 * n ? 'col' : 'region');
  const index = u => u % n;

  // Tier 1: a row, column or region with one open cell left.
  for (let u = 0; u < b.units.length; u++) {
    if (unitDone(b, u)) continue;
    const open = openIn(b, u);
    if (open.length === 1) return { tier: TIER.SINGLE, rule: 'single', place: open[0], unit: { kind: kind(u), index: index(u) }, clear: [] };
  }
  if (maxTier < TIER.SQUEEZE) return null;

  // Tier 2a: a region squeezed into one row (or column) owns that line, so the
  // rest of the line is out. The same goes for a row or column squeezed into
  // one region.
  for (let u = 0; u < b.units.length; u++) {
    if (unitDone(b, u)) continue;
    const open = openIn(b, u);
    const checks = kind(u) === 'region'
      ? [['row', i => rowOf(n, i), v => v], ['col', i => colOf(n, i), v => n + v]]
      : [['region', i => b.regions[i], v => 2 * n + v]];
    for (const [into, key, unitFor] of checks) {
      const keys = new Set(open.map(key));
      if (keys.size !== 1) continue;
      const v = [...keys][0];
      const clear = openIn(b, unitFor(v)).filter(i => !open.includes(i));
      if (clear.length) return { tier: TIER.SQUEEZE, rule: 'squeeze', clear, unit: { kind: kind(u), index: index(u) }, into: { kind: into, index: v } };
    }
  }

  // Tier 2b: a face here would block every open cell of some other unit.
  for (let cell = 0; cell < n * n; cell++) {
    if (!b.open[cell]) continue;
    const blocked = new Set(blockedBy(n, b.regions, cell));
    const own = unitsOf(b, cell);
    for (let u = 0; u < b.units.length; u++) {
      if (own.includes(u) || unitDone(b, u)) continue;
      const open = openIn(b, u);
      if (open.length && open.every(i => blocked.has(i))) {
        return { tier: TIER.SQUEEZE, rule: 'blocks', clear: [cell], unit: { kind: kind(u), index: index(u) } };
      }
    }
  }
  if (maxTier < TIER.PIGEONHOLE) return null;

  // Tier 3: k regions that only fit in k rows fill those rows, so nothing
  // else in them can hold a face. And the mirror: k rows that only reach k
  // regions use up those regions. Same for columns.
  const todo = (from, to) => [...Array(to - from).keys()].map(i => i + from).filter(u => !unitDone(b, u));
  const lines = [['row', todo(0, n), i => rowOf(n, i), v => v], ['col', todo(n, 2 * n), i => colOf(n, i), v => n + v]];
  const regionUnits = todo(2 * n, 3 * n);
  for (const [lineKind, lineUnits, lineKey, lineUnit] of lines) {
    const tries = [
      [regionUnits, lineKey, lineUnit, 'region', lineKind],
      [lineUnits, i => b.regions[i], v => 2 * n + v, lineKind, 'region'],
    ];
    for (const [group, key, unitFor, groupKind, intoKind] of tries) {
      for (let k = 2; k < group.length; k++) {
        let found = null;
        subsets(group, k, chosen => {
          const cells = new Set(chosen.flatMap(u => openIn(b, u)));
          const keys = new Set([...cells].map(key));
          if (keys.size !== k) return false;
          const clear = [...keys].flatMap(v => openIn(b, unitFor(v))).filter(i => !cells.has(i));
          if (!clear.length) return false;
          found = {
            tier: TIER.PIGEONHOLE, rule: 'pigeonhole', clear,
            group: { kind: groupKind, indexes: chosen.map(index) },
            into: { kind: intoKind, indexes: [...keys].sort((x, y) => x - y) },
          };
          return true;
        });
        if (found) return found;
      }
    }
  }
  if (maxTier < TIER.DEAD_END) return null;

  // Tier 4: try a face here and follow the easier rules; if the board breaks,
  // it can't go here.
  for (let cell = 0; cell < n * n; cell++) {
    if (!b.open[cell]) continue;
    const t = cloneBoard(b);
    place(t, cell);
    let s;
    while (!broken(t) && (s = nextStep(t, TIER.PIGEONHOLE))) apply(t, s);
    if (broken(t)) return { tier: TIER.DEAD_END, rule: 'deadEnd', clear: [cell] };
  }
  return null;
}

export function apply(b, step) {
  if (step.place != null) place(b, step.place);
  for (const i of step.clear) b.open[i] = 0;
}

// Solve from scratch with rules up to maxTier. `tier` is the hardest rule the
// solve needed, which is how levels are graded.
export function deduce(n, regions, maxTier = TIER.DEAD_END) {
  const b = newBoard(n, regions), steps = [];
  let tier = 0, s;
  while (b.stars.length < n && !broken(b) && (s = nextStep(b, maxTier))) {
    apply(b, s);
    steps.push(s);
    tier = Math.max(tier, s.tier);
  }
  const solved = isSolved(n, regions, b.stars);
  return { solved, tier, steps, stars: b.stars.slice().sort((x, y) => x - y) };
}

// ── The generator ───────────────────────────────────────────────────────────
// One face per row and column with no two in neighbouring rows sitting in the
// same or neighbouring columns.
function layAnswer(n, rand) {
  const cols = [];
  const used = new Set();
  (function row(r) {
    if (r === n) return true;
    for (const c of shuffle(rand, [...Array(n).keys()])) {
      if (used.has(c) || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
      cols[r] = c; used.add(c);
      if (row(r + 1)) return true;
      used.delete(c);
    }
    return false;
  })(0);
  return cols.map((c, r) => r * n + c);
}

// Grow every region out from its face, one cell at a time, until the board
// is covered. Picking the region to grow at random gives a mix of big and
// small shapes, which is what makes the puzzles interesting.
function growRegions(n, answer, rand) {
  const regions = new Array(n * n).fill(-1);
  answer.forEach((cell, g) => { regions[cell] = g; });
  let left = n * n - n;
  while (left > 0) {
    const g = Math.floor(rand() * n);
    const edge = [];
    for (let i = 0; i < n * n; i++) {
      if (regions[i] === g) for (const j of sides(n, i)) if (regions[j] === -1) edge.push(j);
    }
    if (!edge.length) continue;
    regions[pick(rand, edge)] = g;
    left--;
  }
  return regions;
}

function connected(n, regions, g) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === g) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), stack = [cells[0]];
  while (stack.length) {
    for (const j of sides(n, stack.pop())) {
      if (regions[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

// While some other answer also fits, take a face from that other answer that
// isn't in ours and hand its cell to a neighbouring region. That region now
// has two of the other answer's faces, so the other answer is gone. Repeat
// until ours is the only one, or give up and let the caller start over.
function makeUnique(n, regions, answer, rand) {
  const mine = new Set(answer);
  for (let round = 0; round < n * n * 3; round++) {
    const found = solutions(n, regions, 2);
    const other = found.find(s => s.some(c => !mine.has(c)));
    if (!other) return found.length === 1;
    let moved = false;
    for (const cell of shuffle(rand, other.filter(c => !mine.has(c)))) {
      const from = regions[cell];
      for (const j of shuffle(rand, sides(n, cell))) {
        const to = regions[j];
        if (to === from) continue;
        regions[cell] = to;
        if (connected(n, regions, from)) { moved = true; break; }
        regions[cell] = from;
      }
      if (moved) break;
    }
    if (!moved) return false;
  }
  return false;
}

// Number regions top to bottom, left to right, so the colors land the same
// way on every board.
function renumber(n, regions) {
  const map = new Map();
  return regions.map(g => { if (!map.has(g)) map.set(g, map.size); return map.get(g); });
}

// A board of size n whose hardest needed rule is between minTier and maxTier.
// Same seed, same board.
export function generate(n, seed, { minTier = 1, maxTier = TIER.PIGEONHOLE, attempts = 400 } = {}) {
  const rand = rng(seed);
  let fallback = null;
  // Past `attempts`, settle for the closest miss rather than keep a phone
  // spinning.
  for (let a = 0; ; a++) {
    if (a >= attempts && fallback) return fallback;
    const answer = layAnswer(n, rand);
    const grown = growRegions(n, answer, rand);
    if (!makeUnique(n, grown, answer, rand)) continue;
    const regions = renumber(n, grown);
    const solve = deduce(n, regions, maxTier);
    if (!solve.solved) continue;
    const level = { n, seed, regions, answer: answer.slice().sort((x, y) => x - y), tier: solve.tier, steps: solve.steps.length };
    if (solve.tier >= minTier) return level;
    fallback = fallback || level;
  }
}

// ── Levels ──────────────────────────────────────────────────────────────────
// The ladder: boards get bigger, then the rules get harder. Every level is
// generated from its number, so there's no end to it.
export const STAGES = [
  { upTo: 5, n: 5, minTier: 1, maxTier: 2, name: 'Warm up' },
  { upTo: 15, n: 6, minTier: 2, maxTier: 2, name: 'Easy' },
  { upTo: 30, n: 7, minTier: 2, maxTier: 3, name: 'Medium' },
  { upTo: 50, n: 8, minTier: 3, maxTier: 3, name: 'Hard' },
  { upTo: 75, n: 9, minTier: 3, maxTier: 3, name: 'Expert' },
  { upTo: Infinity, n: 9, minTier: 4, maxTier: 4, name: 'Master' },
];

export function stageFor(level) {
  return STAGES.find(s => level <= s.upTo);
}

export function levelSeed(level) {
  return (Math.imul(level, 2654435761) ^ 0x5eed) >>> 0;
}

export function makeLevel(level) {
  const s = stageFor(level);
  return { ...generate(s.n, levelSeed(level), s), level, stage: s.name };
}

// The daily board: the same for everyone on a given date, always 8 by 8.
export function dailySeed(date) {
  const [y, m, d] = date.split('-').map(Number);
  return (y * 10000 + m * 100 + d) * 7919 >>> 0;
}

export function makeDaily(date) {
  return { ...generate(8, dailySeed(date), { minTier: 3, maxTier: 3 }), daily: date, stage: 'Daily' };
}

// ── Hints ───────────────────────────────────────────────────────────────────
// What to tell a player looking at `stars` (always right: wrong taps are
// turned away) and their own ✕ marks, which might not be. Returns the first
// step that shows them something they haven't already marked.
export function hint(level, stars, marks) {
  const { n, regions, answer } = level;
  const wrongMark = [...marks].find(i => answer.includes(i) && !stars.includes(i));
  if (wrongMark != null) return { rule: 'wrongMark', cells: [wrongMark] };
  const b = newBoard(n, regions);
  for (const s of stars) place(b, s);
  const seen = new Set(marks);
  for (let i = 0; i < n * n; i++) if (!b.open[i]) seen.add(i);
  let s;
  while (b.stars.length < n && (s = nextStep(b))) {
    if (s.place != null && !stars.includes(s.place)) return { ...s, cells: [s.place] };
    const fresh = s.clear.filter(i => !seen.has(i));
    if (fresh.length) return { ...s, cells: fresh };
    apply(b, s);
  }
  // Out of tricks: point straight at the next face.
  const next = answer.find(c => !stars.includes(c));
  return next == null ? null : { rule: 'reveal', place: next, cells: [next] };
}
