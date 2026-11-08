/* Your record: hands, money, and how closely you follow the chart. Pure;
 * app.js keeps one copy for this session and one for all time, in
 * localStorage on this phone only.
 */

export function emptyStats() {
  return {
    v: 1, since: 0,
    hands: 0, wins: 0, losses: 0, pushes: 0, bjs: 0, busts: 0, doubles: 0, splits: 0, surrenders: 0,
    net: 0, wagered: 0,
    decisions: 0, correct: 0, evLost: 0,
    cells: {},          // { [cellKey]: { name, n, miss } }
    mistakes: [],       // newest first: { name, did, should, loss }
    history: [],        // bankroll after each round, newest last
    drills: { strategy: { n: 0, ok: 0, best: 0 }, count: { n: 0, ok: 0 } },
  };
}

const MAX_MISTAKES = 30, MAX_HISTORY = 300;
const r2 = (n) => Math.round(n * 100) / 100;

/* Make sure a copy read back from storage has every field, whatever
 * version wrote it.
 */
export function loadStats(raw) {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.cells = raw.cells && typeof raw.cells === 'object' ? raw.cells : {};
  out.mistakes = Array.isArray(raw.mistakes) ? raw.mistakes.slice(0, MAX_MISTAKES) : [];
  out.history = Array.isArray(raw.history) ? raw.history.slice(-MAX_HISTORY) : [];
  out.drills = { strategy: { ...base.drills.strategy, ...(raw.drills && raw.drills.strategy) }, count: { ...base.drills.count, ...(raw.drills && raw.drills.count) } };
  return out;
}

/* One decision at the table (or in the drill, with `drill: true`, which
 * counts toward the chart cells but not toward table accuracy).
 */
export function recordDecision(s, { key, name, did, should, loss = 0, drill = false }) {
  const ok = did === should;
  if (!drill) {
    s.decisions++;
    if (ok) s.correct++;
    else s.evLost = r2(s.evLost + Math.max(0, loss));
  }
  const c = s.cells[key] || { name, n: 0, miss: 0 };
  c.n++;
  if (!ok) c.miss++;
  c.name = name;
  s.cells[key] = c;
  if (!ok) {
    s.mistakes.unshift({ name, did, should, loss: r2(Math.max(0, loss)), drill: !!drill });
    s.mistakes.length = Math.min(s.mistakes.length, MAX_MISTAKES);
  }
  return ok;
}

/* A seat after the round was settled (blackjack.js). */
export function recordRound(s, seat) {
  if (!seat || !seat.hands || !seat.hands.length) return;
  for (const h of seat.hands) {
    s.hands++;
    s.wagered = r2(s.wagered + (h.bet || 0));
    if (h.dbl) s.doubles++;
    if (h.split) s.splits += 0.5; // each split makes two hands
    if (h.res === 'win' || h.res === 'bj') s.wins++;
    else if (h.res === 'push') s.pushes++;
    else s.losses++;
    if (h.res === 'bj') s.bjs++;
    if (h.res === 'bust') s.busts++;
    if (h.res === 'surrender') s.surrenders++;
  }
  s.net = r2(s.net + (seat.last || 0));
  s.history.push(r2(seat.bank));
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
}

export const accuracy = (s) => (s.decisions ? s.correct / s.decisions : null);

/* The chart cells you miss most, worst first. A cell needs a couple of
 * tries before it counts as a leak rather than bad luck with one tap.
 */
export function leaks(s, n = 6) {
  return Object.entries(s.cells)
    .filter(([, c]) => c.miss > 0)
    .map(([key, c]) => ({ key, name: c.name, n: c.n, miss: c.miss, rate: c.miss / c.n }))
    .sort((a, b) => b.miss - a.miss || b.rate - a.rate || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function drillResult(s, kind, ok, streak = 0) {
  const d = s.drills[kind];
  d.n++;
  if (ok) d.ok++;
  if (kind === 'strategy' && streak > d.best) d.best = streak;
}
