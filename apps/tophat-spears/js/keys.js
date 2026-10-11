/* Turning a lobby password into a room id.
 *
 * There are no accounts and no room list. The room's id is derived from the
 * password, and the database rules refuse to list rooms, so knowing the
 * password is the only way to find one. The plaintext never leaves this
 * file: it isn't stored, sent or logged.
 *
 * PBKDF2 makes each guess cost real time, which turns "try every common
 * password" from seconds into something not worth starting.
 */

const ITERATIONS = 200000;
const KEY_BITS = 256;

export async function roomKey(password) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('This browser cannot make a room key (needs HTTPS).');
  const enc = new TextEncoder();
  const material = await subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode('tophat-spears:v1:room'), iterations: ITERATIONS, hash: 'SHA-256' },
    material, KEY_BITS,
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.trim().length < 4) return 'Use at least 4 characters so strangers can’t stumble in.';
  return '';
}
