/* "1 to 10" played across phones: rooms, roles, and who may do what next.
 *
 * Pure. No DOM, no Firebase, so the whole state machine runs in node. The
 * rules about who can see the secret number are the entire game, so they
 * are worth being able to prove rather than hope.
 *
 * The central constraint, which shapes everything below: Firestore can hide
 * a document but not a field inside one. Every player has to read the room
 * to play, so the secret number can never live in the room document while
 * the round is running. It lives in a private document only its owner can
 * read, and is copied into the room only at the reveal.
 */

/* ── room codes ──────────────────────────────────────────────────────────── */

/* No O/0, no I/1/L. Somebody is going to read this down a phone line to a
 * grandparent, and "is that an oh or a zero" ends the game before it starts.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function makeCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

/* Take whatever they typed and make a code of it: lower case, spaces and
 * hyphens, and the lookalikes they typed anyway because their phone
 * suggested them.
 */
export function normaliseCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/* Why a typed code can be rejected, in words rather than "invalid".
 *
 * The alphabet leaves out the lookalikes on purpose, so a code containing
 * one is a misread rather than a typo to be guessed at. Silently turning a
 * typed O into a Q would be a worse answer than saying what happened.
 */
export function codeProblem(input) {
  const code = normaliseCode(input);
  if (!code) return 'Type the room code.';
  const bad = [...new Set([...code].filter((c) => !CODE_ALPHABET.includes(c)))];
  if (bad.length) {
    return `Room codes never contain ${bad.join(', ')}. Check for a 0 that is really a Q, or an I that is really a J.`;
  }
  if (code.length !== CODE_LENGTH) return `Room codes are ${CODE_LENGTH} characters.`;
  return null;
}

export function isValidCode(code) {
  if (typeof code !== 'string' || code.length !== CODE_LENGTH) return false;
  return [...code].every((c) => CODE_ALPHABET.includes(c));
}

/* ── names ───────────────────────────────────────────────────────────────── */

export const MAX_NAME = 16;

export function cleanName(input) {
  return String(input || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

export function nameProblem(input, taken = []) {
  const n = cleanName(input);
  if (!n) return 'Pick a name so everyone knows who you are.';
  if (n.length < 2) return 'A bit longer than that.';
  const lower = n.toLowerCase();
  if (taken.some((t) => String(t).toLowerCase() === lower)) return 'Somebody in the room already has that name.';
  return null;
}

/* ── the round ───────────────────────────────────────────────────────────── */

export const PHASES = ['picking', 'asking', 'guessing', 'revealed'];

export function freshRound(n, pickerUid) {
  return { n, pickerUid, phase: 'picking', questions: [], guesses: {}, secret: null };
}

export const playerIds = (room) => Object.keys((room && room.players) || {});
export const guesserIds = (room) => playerIds(room).filter((u) => u !== room.round.pickerUid);

export const isPicker = (room, uid) => Boolean(room && room.round && room.round.pickerUid === uid);

/* Who may do what, derived rather than stored, so two phones acting at once
 * cannot leave the room in a state nobody agrees on.
 */
export function canSetNumber(room, uid) {
  return Boolean(room && room.round && room.round.phase === 'picking' && isPicker(room, uid));
}

export function canAsk(room, uid) {
  if (!room || !room.round) return false;
  if (room.round.phase !== 'asking') return false;
  if (isPicker(room, uid)) return false;            // you cannot ask yourself
  // One question at a time: the last one has to be answered first.
  const last = room.round.questions[room.round.questions.length - 1];
  return !last || typeof last.answer === 'string';
}

export function canAnswer(room, uid) {
  if (!room || !room.round) return false;
  if (room.round.phase !== 'asking') return false;
  if (!isPicker(room, uid)) return false;
  const last = room.round.questions[room.round.questions.length - 1];
  return Boolean(last) && typeof last.answer !== 'string';
}

export function canGuess(room, uid) {
  if (!room || !room.round) return false;
  if (room.round.phase !== 'guessing') return false;
  if (isPicker(room, uid)) return false;
  return !(uid in (room.round.guesses || {}));
}

// The picker decides when enough has been asked, since only they can tell
// whether their answers have given it away.
export function canOpenGuessing(room, uid) {
  if (!room || !room.round) return false;
  if (room.round.phase !== 'asking') return false;
  if (!isPicker(room, uid)) return false;
  const answered = room.round.questions.filter((q) => typeof q.answer === 'string').length;
  return answered >= 1;
}

export function everyoneGuessed(room) {
  const g = guesserIds(room);
  if (!g.length) return false;
  const guesses = (room.round && room.round.guesses) || {};
  return g.every((u) => u in guesses);
}

export function canReveal(room, uid) {
  if (!room || !room.round) return false;
  if (room.round.phase !== 'guessing') return false;
  if (!isPicker(room, uid)) return false;
  return everyoneGuessed(room);
}

/* Whose turn it is to pick next. Straight rotation through the player list
 * in a stable order, so everyone gets a go and nobody has to decide.
 */
export function nextPicker(room) {
  const ids = playerIds(room).sort();
  if (!ids.length) return null;
  const at = ids.indexOf(room.round ? room.round.pickerUid : null);
  return ids[(at + 1) % ids.length];
}

/* A room with fewer than two people cannot be played: somebody has to guess.
 * Said plainly so the lobby can explain the wait.
 */
export const MIN_PLAYERS = 2;
export const canStart = (room) => playerIds(room).length >= MIN_PLAYERS;

/* ── what the screen should show ─────────────────────────────────────────── */

/* One place that turns room state plus who you are into a single instruction.
 * Scattering this across the UI is how two phones end up disagreeing about
 * whose turn it is.
 */
export function whatNow(room, uid) {
  if (!room) return { do: 'none', say: '' };
  if (!canStart(room)) {
    return { do: 'wait', say: `Waiting for somebody else to join. Share the code: ${room.code}` };
  }
  const r = room.round;
  if (!r) return { do: 'wait', say: 'Waiting for the round to start.' };

  const picker = (room.players[r.pickerUid] || {}).name || 'somebody';

  switch (r.phase) {
    case 'picking':
      return isPicker(room, uid)
        ? { do: 'pick', say: 'Pick your secret number. Nobody else can see it.' }
        : { do: 'wait', say: `${picker} is picking a number.` };
    case 'asking':
      if (canAnswer(room, uid)) return { do: 'answer', say: 'Answer with something you would rate exactly your number.' };
      if (isPicker(room, uid)) return { do: 'wait', say: 'Waiting for a question.' };
      if (canAsk(room, uid)) return { do: 'ask', say: `Ask ${picker} about a category.` };
      return { do: 'wait', say: `Waiting for ${picker} to answer.` };
    case 'guessing':
      if (canGuess(room, uid)) return { do: 'guess', say: `What is ${picker}'s number?` };
      if (isPicker(room, uid)) {
        return everyoneGuessed(room)
          ? { do: 'reveal', say: 'Everyone has guessed. Show them.' }
          : { do: 'wait', say: 'Waiting for the guesses.' };
      }
      return { do: 'wait', say: 'Waiting for the others to guess.' };
    case 'revealed':
      return { do: 'next', say: 'Round over.' };
    default:
      return { do: 'wait', say: '' };
  }
}
