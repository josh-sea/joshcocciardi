/* "1 to 10" rooms: the security rules, tested against the emulator.
 *
 * The entire game is "exactly one person knows the number". Every other
 * player has to be able to read the room, because the questions, the
 * answers and the turn order all live there, so the only thing keeping the
 * number secret is a rule. A rule that compiles is not a rule that works,
 * hence this.
 *
 * Two guarantees are checked here that cannot be checked anywhere else:
 *   1. nobody but the picker can read the private document holding the number
 *   2. the number revealed at the end is the number committed at the start,
 *      so a picker cannot see the guesses and then change their mind
 *
 * Plus the catch-all: firestore.rules ends with a rule granting any signed-in
 * user read/write on any collection NOT in a deny list, so `scale_` being
 * absent from that list would make every room world-writable.
 *
 * Run: node functions/test/scale-rules.test.mjs
 */
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);
const PICKER = 'uid_picker', GUESSER = 'uid_guesser', STRANGER = 'uid_stranger';
const CODE = 'ABCDE';

let failures = 0, passes = 0;
const check = async (name, promise) => {
  try { await promise; console.log(`  ok   ${name}`); passes++; }
  catch (e) { console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`); failures++; }
};

const env = await initializeTestEnvironment({
  projectId: 'scale-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: PORT },
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const baseRoom = (over = {}) => ({
  code: CODE,
  hostUid: PICKER,
  players: { [PICKER]: { name: 'Cam', score: 0 }, [GUESSER]: { name: 'Bo', score: 0 } },
  round: { n: 1, pickerUid: PICKER, phase: 'picking', questions: [], guesses: {}, secret: null },
  ...over,
});

const seed = async (room = baseRoom(), secret = null) => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'scale_rooms', CODE), room);
    if (secret !== null) {
      await setDoc(doc(db, 'scale_rooms', CODE, 'private', PICKER), { round: 1, secret });
    }
  });
};

/* ── the catch-all ───────────────────────────────────────────────────────── */
console.log('\nthe catch-all does not reach these rooms');
await seed();
await check('a stranger cannot read a room they are not in',
  assertFails(getDoc(doc(as(STRANGER), 'scale_rooms', CODE))));
await check('a stranger cannot rewrite the round',
  assertFails(updateDoc(doc(as(STRANGER), 'scale_rooms', CODE), { round: { n: 99 } })));
await check('nor delete the room',
  assertFails(deleteDoc(doc(as(STRANGER), 'scale_rooms', CODE))));
await check('signed out, you get nothing at all',
  assertFails(getDoc(doc(anon(), 'scale_rooms', CODE))));

/* ── the secret ──────────────────────────────────────────────────────────── */
console.log('\nthe number only one person can read');
await seed(baseRoom(), 8);
await check('the picker reads their own number',
  assertSucceeds(getDoc(doc(as(PICKER), 'scale_rooms', CODE, 'private', PICKER))));
await check('another player in the room cannot read it',
  assertFails(getDoc(doc(as(GUESSER), 'scale_rooms', CODE, 'private', PICKER))));
await check('nor can a stranger',
  assertFails(getDoc(doc(as(STRANGER), 'scale_rooms', CODE, 'private', PICKER))));
await check('nor can somebody signed out',
  assertFails(getDoc(doc(anon(), 'scale_rooms', CODE, 'private', PICKER))));
await check('a player cannot overwrite the picker\'s number',
  assertFails(setDoc(doc(as(GUESSER), 'scale_rooms', CODE, 'private', PICKER), { secret: 1 })));
await check('but you may write your own',
  assertSucceeds(setDoc(doc(as(GUESSER), 'scale_rooms', CODE, 'private', GUESSER), { round: 1, secret: 3 })));

/* ── joining ─────────────────────────────────────────────────────────────── */
console.log('\njoining a room');
await seed();
await check('a member reads the room',
  assertSucceeds(getDoc(doc(as(GUESSER), 'scale_rooms', CODE))));
await check('a newcomer adds themselves',
  assertSucceeds(updateDoc(doc(as(STRANGER), 'scale_rooms', CODE), {
    [`players.${STRANGER}`]: { name: 'Dad', score: 0 },
  })));
await seed();
await check('but cannot add somebody else',
  assertFails(updateDoc(doc(as(STRANGER), 'scale_rooms', CODE), {
    'players.uid_someone_else': { name: 'Ghost', score: 0 },
  })));
await seed();
await check('and cannot shove the others out on the way in',
  assertFails(setDoc(doc(as(STRANGER), 'scale_rooms', CODE), {
    ...baseRoom(), players: { [STRANGER]: { name: 'Dad', score: 0 } },
  })));
await seed();
await check('a newcomer cannot rewrite the round while joining',
  assertFails(updateDoc(doc(as(STRANGER), 'scale_rooms', CODE), {
    [`players.${STRANGER}`]: { name: 'Dad', score: 0 },
    'round.phase': 'revealed',
  })));

console.log('\ncreating a room');
await env.clearFirestore();
await check('you create a room you host, with yourself in it',
  assertSucceeds(setDoc(doc(as(PICKER), 'scale_rooms', 'NEW01'), {
    code: 'NEW01', hostUid: PICKER,
    players: { [PICKER]: { name: 'Cam', score: 0 } },
    round: { n: 1, pickerUid: PICKER, phase: 'picking', questions: [], guesses: {}, secret: null },
  })));
await check('you cannot create a room hosted by somebody else',
  assertFails(setDoc(doc(as(PICKER), 'scale_rooms', 'NEW02'), {
    code: 'NEW02', hostUid: STRANGER, players: { [STRANGER]: { name: 'x', score: 0 } },
  })));
await check('nor one you are not even in',
  assertFails(setDoc(doc(as(PICKER), 'scale_rooms', 'NEW03'), {
    code: 'NEW03', hostUid: PICKER, players: {},
  })));

/* ── the reveal ──────────────────────────────────────────────────────────── */
console.log('\nthe reveal has to match what was committed');
const guessed = () => baseRoom({
  round: { n: 1, pickerUid: PICKER, phase: 'guessing', questions: [], guesses: { [GUESSER]: 7 }, secret: null },
});

await seed(guessed(), 8);
await check('the picker reveals the number they committed',
  assertSucceeds(updateDoc(doc(as(PICKER), 'scale_rooms', CODE), {
    'round.secret': 8, 'round.phase': 'revealed',
  })));

await seed(guessed(), 8);
await check('the picker cannot reveal a different number',
  assertFails(updateDoc(doc(as(PICKER), 'scale_rooms', CODE), {
    'round.secret': 2, 'round.phase': 'revealed',
  })));

await seed(guessed(), 8);
await check('and cannot invent one that moves away from the guess',
  assertFails(updateDoc(doc(as(PICKER), 'scale_rooms', CODE), {
    'round.secret': 1, 'round.phase': 'revealed',
  })));

await seed(guessed(), 8);
await check('another player cannot reveal it at all',
  assertFails(updateDoc(doc(as(GUESSER), 'scale_rooms', CODE), {
    'round.secret': 8, 'round.phase': 'revealed',
  })));

// Committing nothing and then claiming a number must fail too.
await seed(guessed(), null);
await check('a picker who committed nothing cannot reveal anything',
  assertFails(updateDoc(doc(as(PICKER), 'scale_rooms', CODE), {
    'round.secret': 8, 'round.phase': 'revealed',
  })));

// Ordinary play must not be blocked by the reveal guard.
console.log('\nordinary play is unaffected');
await seed(baseRoom(), 8);
await check('a guesser asks a question',
  assertSucceeds(updateDoc(doc(as(GUESSER), 'scale_rooms', CODE), {
    'round.phase': 'asking',
    'round.questions': [{ topic: 'Desserts in Magic Kingdom', askedBy: GUESSER, answer: null }],
  })));
await seed(baseRoom({
  round: { n: 1, pickerUid: PICKER, phase: 'asking', questions: [{ topic: 'x', askedBy: GUESSER, answer: null }], guesses: {}, secret: null },
}), 8);
await check('the picker answers it',
  assertSucceeds(updateDoc(doc(as(PICKER), 'scale_rooms', CODE), {
    'round.questions': [{ topic: 'x', askedBy: GUESSER, answer: 'Dole Whip' }],
  })));
await seed(baseRoom({
  round: { n: 1, pickerUid: PICKER, phase: 'guessing', questions: [], guesses: {}, secret: null },
}), 8);
await check('a guesser submits a guess',
  assertSucceeds(updateDoc(doc(as(GUESSER), 'scale_rooms', CODE), {
    [`round.guesses.${GUESSER}`]: 7,
  })));

await env.cleanup();
console.log(`\n${passes} passing, ${failures} failing\n`);
process.exit(failures ? 1 : 0);
