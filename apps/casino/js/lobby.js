/* Table codes, names and who is in charge. Pure: no DOM, no Firebase.
 *
 * A table with friends is a five-character code. Whoever opens it is the
 * host, and the host's phone runs the table: it shuffles, deals, plays the
 * dealer and pays out. Everyone else only says what they did ("hit",
 * "bet 25"). If the host's phone drops out, whoever has been at the table
 * longest takes over from the same shoe.
 */

/* No O/0, no I/1/L, so a code read out loud is never ambiguous. */
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
  if (!code) return 'Type the table code.';
  const bad = [...new Set([...code].filter((c) => !CODE_ALPHABET.includes(c)))];
  if (bad.length) return `Table codes never have ${bad.join(', ')} in them. Check for a 0 that is really a Q.`;
  if (code.length !== CODE_LENGTH) return `Table codes are ${CODE_LENGTH} characters.`;
  return null;
}

export const MAX_NAME = 16;

export const cleanName = (input) =>
  String(input || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();

export const nameProblem = (input) => (cleanName(input) ? null : 'Pick a name so everyone knows who you are.');

export const list = (players) => Object.entries(players || {}).map(([uid, p]) => ({ uid, ...p }));

export const byJoin = (players) =>
  list(players).sort((a, b) => (a.joined || 0) - (b.joined || 0) || (a.uid < b.uid ? -1 : 1));

export const online = (players) => byJoin(players).filter((p) => p.online);

/* The host keeps the table while their phone is connected; after that it
 * goes to whoever has been there longest.
 */
export function pickHost(players, current) {
  const cur = players && players[current];
  if (cur && cur.online) return current;
  const on = online(players);
  return on.length ? on[0].uid : current;
}

/* Small seeded generator so the tests can deal the same shoe twice. */
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
