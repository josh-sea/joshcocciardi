/* Rooms, names and who is in charge. Pure: no DOM, no Firebase.
 *
 * A room is a five-character code. Whoever makes it is the host, and the
 * host's phone runs the game: it deals, keeps time, checks answers and
 * keeps score. Everyone else only ever says what they did ("I picked B",
 * "I guessed cake"). If the host's phone drops out, the person who has been
 * in the room longest takes over from where the game was.
 */

/* No O/0, no I/1/L, so nobody has to ask "is that an oh or a zero" when the
 * code is read out over a video call.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function makeCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return out;
}

export const normaliseCode = (input) => String(input || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

export function codeProblem(input) {
  const code = normaliseCode(input);
  if (!code) return 'Type the room code.';
  const bad = [...new Set([...code].filter((c) => !CODE_ALPHABET.includes(c)))];
  if (bad.length) return `Room codes never have ${bad.join(', ')} in them. Check for a 0 that is really a Q.`;
  if (code.length !== CODE_LENGTH) return `Room codes are ${CODE_LENGTH} characters.`;
  return null;
}

export const MAX_NAME = 16;

export const cleanName = (input) =>
  String(input || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();

export function nameProblem(input) {
  const n = cleanName(input);
  if (!n) return 'Pick a name so everyone knows who you are.';
  return null;
}

/* ── players ─────────────────────────────────────────────────────────────── */

export const list = (players) => Object.entries(players || {}).map(([uid, p]) => ({ uid, ...p }));

/* Everyone in join order, which is also turn order: whoever made the room
 * draws first, then the next person who arrived, and so on.
 */
export const byJoin = (players) =>
  list(players).sort((a, b) => (a.joined || 0) - (b.joined || 0) || (a.uid < b.uid ? -1 : 1));

export const online = (players) => byJoin(players).filter((p) => p.online);

/* The current host keeps the room while their phone is connected. After
 * that it goes to whoever has been in the room longest.
 */
export function pickHost(players, current) {
  const cur = players && players[current];
  if (cur && cur.online) return current;
  const on = online(players);
  return on.length ? on[0].uid : current;
}

/* Two Joshes in one room is fine for the people, not for a scoreboard. */
export function displayNames(players) {
  const seen = {}, out = {};
  for (const p of byJoin(players)) {
    const base = p.name || 'Player';
    const k = base.toLowerCase();
    seen[k] = (seen[k] || 0) + 1;
    out[p.uid] = seen[k] > 1 ? `${base} ${seen[k]}` : base;
  }
  return out;
}

/* ── the games on the menu ───────────────────────────────────────────────── */

export const GAMES = {
  forehead: {
    name: 'Forehead', emoji: '🤳', min: 2,
    blurb: 'Hold the phone to your forehead. Everyone else gets you to say the word. Tilt down when you get it, up to pass.',
  },
  trivia: {
    name: 'Trivia', emoji: '🧠', min: 1,
    blurb: 'Same question on every phone. Get it right, and get it right first.',
  },
  sketch: {
    name: 'Quick Sketch', emoji: '✏️', min: 2,
    blurb: 'One person draws, everyone else races to guess what it is.',
  },
  chips: {
    name: 'Chips & Dip', emoji: '🥣', min: 3,
    blurb: 'Two chips on the table. Play the dip from your hand that goes with both. The judge picks a favorite.',
  },
};

/* ── shared helpers for the games ────────────────────────────────────────── */

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Small seeded generator so the tests can deal the same hand twice. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Firebase drops empty objects and arrays on the way in, so anything read
 * back from the room may be missing the keys it was written with.
 */
export const obj = (x) => (x && typeof x === 'object' ? x : {});
export const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

/* Add points to a scores map without mutating it. */
export function addScore(scores, uid, n) {
  const s = { ...obj(scores) };
  s[uid] = (s[uid] || 0) + n;
  return s;
}

/* Scoreboard rows, highest first, with shared places for ties. */
export function standings(scores, names) {
  const rows = Object.entries(obj(scores))
    .map(([uid, score]) => ({ uid, score, name: (names && names[uid]) || 'Player' }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 0, last = null;
  rows.forEach((r, i) => {
    if (r.score !== last) { place = i + 1; last = r.score; }
    r.place = place;
  });
  return rows;
}
