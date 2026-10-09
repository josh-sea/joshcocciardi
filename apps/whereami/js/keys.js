/* Turning a deck name and a password into the only way in.
 *
 * There is no account here and no access list. A deck's key is derived from
 * its name and password, and that key is the document id of the pointer that
 * names the deck. Know the pair, find the deck; don't, and there is nothing
 * to find, because the rules deny `list` on the pointers.
 *
 * The plaintext password never leaves this file. It is never sent to
 * Firestore, never stored, and never logged.
 *
 * PBKDF2 with a high iteration count is doing real work here. Every guess an
 * attacker makes costs them this derivation plus a network round trip, which
 * is what turns "try the top 10,000 passwords" from seconds into something
 * not worth starting. The deck name is the salt: two decks with the same
 * password still land on different keys.
 */

const ITERATIONS = 310000;   // OWASP's PBKDF2-SHA256 floor, ~0.3s on a phone
const KEY_BITS = 256;

// Deck names are typed by people, who will capitalise and space them
// differently every time. Fold that away so "Disney 2026" and "disney  2026"
// open the same deck, while leaving the password untouched.
export function normaliseName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* The derived key, as hex. Firestore document ids cannot exceed 1500 bytes
 * and must not contain a slash; hex is safe on both counts.
 */
export async function deriveKey(name, password) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('This browser cannot derive deck keys (needs crypto.subtle over HTTPS).');

  const enc = new TextEncoder();
  const material = await subtle.importKey(
    'raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      // Salting with the deck name, under a label, so the derivation is tied
      // to this app and cannot be replayed against another PBKDF2 user.
      salt: enc.encode('whereami:v1:' + normaliseName(name)),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    material, KEY_BITS,
  );
  return hex(bits);
}

// Deliberately weak passwords make the whole scheme pointless, so the UI
// refuses the worst of them rather than quietly accepting a deck anyone can
// walk into. Not a strength meter: just a floor.
const TOO_COMMON = new Set([
  'password', '12345678', 'disney', 'mickey', 'letmein', 'qwerty',
  'password1', 'iloveyou', '11111111', 'abc12345', 'disney123',
]);

export function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (TOO_COMMON.has(p.toLowerCase())) return 'That one is too easy to guess. Try something else.';
  if (/^(.)\1+$/.test(p)) return 'That is the same character over and over.';
  return null;
}
