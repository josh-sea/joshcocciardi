/* Camboku: the generator and the logic solver, tested without a browser.
 *
 * The promise to a player is that every board has exactly one answer and
 * can be worked out without guessing, and that a hint never points the wrong
 * way. Those are all checkable here.
 *
 * Run: node apps/portfolio/test/camboku.test.mjs
 */
import {
  TIER, STAGES, solutions, deduce, generate, makeLevel, makeDaily, levelSeed, stageFor,
  isSolved, conflicts, blockedBy, hint, rowOf, colOf,
} from '../public/projects/camboku/js/rules.mjs';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); failures++; }
};

function regionsConnected(n, regions) {
  for (let g = 0; g < n; g++) {
    const cells = regions.map((v, i) => (v === g ? i : -1)).filter(i => i >= 0);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop(), r = rowOf(n, i), c = colOf(n, i);
      for (const j of [r > 0 && i - n, r < n - 1 && i + n, c > 0 && i - 1, c < n - 1 && i + 1]) {
        if (j !== false && regions[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

console.log('\nthe rules');
{
  // 4×4: rows 0..3 in columns 1,3,0,2, one region per row.
  const regions = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
  ok('a correct board is solved', isSolved(4, regions, [1, 7, 8, 14]));
  ok('touching at the corner breaks it', conflicts(4, regions, [1, 6]).length === 2);
  ok('sharing a column breaks it', conflicts(4, regions, [1, 13]).length === 2);
  ok('a face rules out its row, column, region and the four corners around it', blockedBy(4, regions, 5).length === 3 + 3 + 4);
  ok('stripes have two answers', solutions(4, regions, 5).length === 2);
}

console.log('\nthe generator');
{
  for (const n of [5, 6, 7, 8, 9]) {
    let unique = 0, logical = 0, shaped = 0, answered = 0;
    const seeds = 12;
    for (let s = 1; s <= seeds; s++) {
      const L = generate(n, s * 101 + n);
      const found = solutions(n, L.regions, 2);
      if (found.length === 1) unique++;
      if (found.length === 1 && found[0].join() === L.answer.join()) answered++;
      if (deduce(n, L.regions, L.tier).solved) logical++;
      if (regionsConnected(n, L.regions) && new Set(L.regions).size === n) shaped++;
    }
    ok(`${n}×${n}: every board has exactly one answer`, unique === seeds, `${unique}/${seeds}`);
    ok(`${n}×${n}: and it's the one the game checks taps against`, answered === seeds);
    ok(`${n}×${n}: every board can be finished by logic alone`, logical === seeds);
    ok(`${n}×${n}: n regions, each in one piece`, shaped === seeds);
  }
  const a = generate(7, 42), b = generate(7, 42);
  ok('the same seed builds the same board', a.regions.join() === b.regions.join());
  ok('a different seed builds a different one', generate(7, 43).regions.join() !== a.regions.join());
}

console.log('\nlevels');
{
  ok('the ladder ends open', STAGES[STAGES.length - 1].upTo === Infinity);
  ok('boards never shrink as you climb', STAGES.every((s, i) => i === 0 || s.n >= STAGES[i - 1].n));
  ok('every level number has its own seed', new Set([...Array(500).keys()].map(i => levelSeed(i + 1))).size === 500);
  for (const lv of [1, 5, 6, 16, 31, 51, 76]) {
    const L = makeLevel(lv), st = stageFor(lv);
    ok(`level ${lv} is a ${st.n}×${st.n} ${st.name} board graded ${st.minTier}..${st.maxTier}`,
      L && L.n === st.n && L.tier >= st.minTier && L.tier <= st.maxTier, L && `tier ${L.tier}`);
  }
  const t0 = Date.now();
  for (let lv = 51; lv <= 60; lv++) makeLevel(lv);
  ok('ten 9×9 levels build in under 5 seconds', Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
  const d = makeDaily('2026-10-28');
  ok("today's board is 8×8 and the same for everyone", d.n === 8 && makeDaily('2026-10-28').regions.join() === d.regions.join());
  ok("tomorrow's is different", makeDaily('2026-10-29').regions.join() !== d.regions.join());
}

console.log('\nhints');
{
  // Follow nothing but hints from an empty board: each one must be true, and
  // they must reach the end.
  for (const lv of [3, 20, 45, 70]) {
    const L = makeLevel(lv);
    const stars = [], marks = new Set();
    let honest = true, steps = 0;
    while (stars.length < L.n && steps++ < 400) {
      const h = hint(L, stars, marks);
      if (!h) { honest = false; break; }
      if (h.place != null) {
        if (!L.answer.includes(h.place)) honest = false;
        stars.push(h.place);
      } else {
        if (h.cells.some(i => L.answer.includes(i))) honest = false;
        h.cells.forEach(i => marks.add(i));
      }
      if (h.rule === 'reveal') honest = false;
    }
    ok(`level ${lv}: hints alone finish the board, and never mark an answer`, honest && isSolved(L.n, L.regions, stars), `${steps} hints`);
  }
  const L = makeLevel(10);
  const h = hint(L, [], new Set([L.answer[0]]));
  ok('a ✕ on an answer cell is called out first', h.rule === 'wrongMark' && h.cells[0] === L.answer[0]);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
