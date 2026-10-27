/* "1 to 10": concurrent writes must not eat each other.
 *
 * Written after playing the game and finding it felt dead. The cause was
 * not the database being slow: ask and answer each rebuilt the whole
 * questions array from whatever snapshot that phone happened to be holding
 * and wrote it back, so two people acting within a second of each other
 * meant the later write replaced the earlier one wholesale. A question
 * would simply vanish, which from the inside is indistinguishable from the
 * app not syncing at all.
 *
 * These run the shipped transaction logic against the emulator. Replace any
 * of them with a plain updateDoc built from a stale copy and they fail.
 *
 * Run: node functions/test/scale-race.test.mjs  (needs the Firestore emulator)
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

let failures = 0, passes = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log(`  ok   ${name}`); passes++; return; }
  console.log(`  FAIL ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  failures++;
};

const env = await initializeTestEnvironment({
  projectId: 'scale-race-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

const A = 'u_josh', B = 'u_ash';
const CODE = 'RACE1';
const dbA = env.authenticatedContext(A).firestore();
const dbB = env.authenticatedContext(B).firestore();
const ref = (db) => doc(db, 'scale_rooms', CODE);

const fresh = (over = {}) => ({
  code: CODE, hostUid: A,
  players: { [A]: { name: 'Josh', score: 0 }, [B]: { name: 'Ashley', score: 0 } },
  round: { n: 1, pickerUid: A, phase: 'asking', questions: [], guesses: {}, secret: null },
  ...over,
});
const seed = async (room = fresh(), secret = null) => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'scale_rooms', CODE), room);
    if (secret !== null) await setDoc(doc(c.firestore(), 'scale_rooms', CODE, 'private', A), { round: 1, secret });
  });
};
const read = async () => (await getDoc(ref(dbA))).data();

/* The shipped implementations. */
const ask = (db, who, topic) => runTransaction(db, async (tx) => {
  const snap = await tx.get(ref(db));
  const r = snap.data().round;
  if (r.phase !== 'asking') throw new Error('moved on');
  const last = r.questions[r.questions.length - 1];
  if (last && typeof last.answer !== 'string') throw new Error('one already waiting');
  tx.update(ref(db), { 'round.questions': [...r.questions, { topic, askedBy: who, answer: null }] });
});
const answer = (db, text) => runTransaction(db, async (tx) => {
  const snap = await tx.get(ref(db));
  const r = snap.data().round;
  if (r.phase !== 'asking' || !r.questions.length) throw new Error('nothing to answer');
  const at = r.questions.length - 1;
  if (typeof r.questions[at].answer === 'string') throw new Error('already answered');
  tx.update(ref(db), { 'round.questions': r.questions.map((q, i) => (i === at ? { ...q, answer: String(text) } : q)) });
});

console.log('\nthe lost-update race that made it feel dead');
{
  /* The exact shape of the bug: two phones holding their own snapshot, both
   * writing an array rebuilt from it. This is what the old code did. */
  await seed();
  const joshCopy = await read();
  const ashCopy = await read();
  await updateDoc(ref(dbB), { 'round.questions': [...ashCopy.round.questions, { topic: 'Desserts', askedBy: B, answer: null }] });
  await updateDoc(ref(dbA), { 'round.questions': [...joshCopy.round.questions, { topic: 'Rides', askedBy: A, answer: null }] });
  const lost = await read();
  ok('the old read-modify-write really does lose a question',
    lost.round.questions.length === 1, lost.round.questions.map((q) => q.topic));
}
{
  await seed();
  /* allSettled, not all: one of these is correctly refused by the "one
   * question at a time" guard, and a rejection here is the guard working
   * rather than a failure. What must never happen is a write silently
   * erasing the other one. */
  const both = await Promise.allSettled([ask(dbB, B, 'Desserts'), ask(dbA, A, 'Rides')]);
  const after = await read();
  ok('with a transaction, nothing is erased',
    after.round.questions.length >= 1
      && after.round.questions.every((q) => ['Desserts', 'Rides'].includes(q.topic)),
    after.round.questions.map((q) => q.topic));
  ok('exactly one of two simultaneous questions lands',
    after.round.questions.length === 1 && both.filter((r) => r.status === 'fulfilled').length === 1,
    { stored: after.round.questions.map((q) => q.topic), outcomes: both.map((r) => r.status) });
}
{
  await seed();
  await ask(dbB, B, 'Lands in EPCOT');
  await answer(dbA, 'France');
  await ask(dbB, B, 'Snacks in any park');
  const stale = await read();          // a copy from before the answer below
  await answer(dbA, 'Churros');
  // Now a late write built on the stale copy must not resurrect or erase.
  await ask(dbB, B, 'Shops at Disney Springs').catch(() => {});
  const after = await read();
  ok('a full exchange keeps every question in order',
    after.round.questions.map((q) => q.topic).join('|') === 'Lands in EPCOT|Snacks in any park|Shops at Disney Springs',
    after.round.questions.map((q) => [q.topic, q.answer]));
  ok('and every answer stays attached to its own question',
    after.round.questions[0].answer === 'France' && after.round.questions[1].answer === 'Churros',
    after.round.questions.map((q) => [q.topic, q.answer]));
  ok('the stale copy was genuinely behind', stale.round.questions.length === 2);
}
{
  // Double taps, which a laggy screen invites.
  await seed();
  await ask(dbB, B, 'Lands in EPCOT');
  const results = await Promise.allSettled([answer(dbA, 'France'), answer(dbA, 'Norway')]);
  const after = await read();
  ok('a double-tapped answer only lands once',
    after.round.questions.length === 1 && ['France', 'Norway'].includes(after.round.questions[0].answer),
    after.round.questions.map((q) => q.answer));
  ok('and the second attempt is refused rather than silently applied',
    results.filter((r) => r.status === 'rejected').length === 1,
    results.map((r) => r.status));
}
{
  // Asking into a round that has moved on.
  await seed(fresh({ round: { n: 1, pickerUid: A, phase: 'guessing', questions: [], guesses: {}, secret: null } }));
  let refused = false;
  await ask(dbB, B, 'Too late').catch(() => { refused = true; });
  ok('a question sent after guessing opened is refused', refused);
  ok('and the room is untouched', (await read()).round.questions.length === 0);
}

console.log('\ncoming back to a room you are already in');
{
  /* Rejoining wrote { name, score: 0 } over the existing entry, so every
   * reload reset your score. Survivable while rejoining was a deliberate
   * tap; permanent once it became automatic. */
  await seed(fresh({ players: { [A]: { name: 'Josh', score: 12 }, [B]: { name: 'Ashley', score: 7 } } }));

  const naive = async (db, who, name) => updateDoc(ref(db), { [`players.${who}`]: { name, score: 0 } });
  await naive(dbB, B, 'Ashley');
  ok('the old rejoin really did wipe the score', (await read()).players[B].score === 0,
    (await read()).players[B]);

  await seed(fresh({ players: { [A]: { name: 'Josh', score: 12 }, [B]: { name: 'Ashley', score: 7 } } }));
  // The shipped version: a successful read proves membership, so keep the score.
  const rejoin = async (db, who, name) => {
    const snap = await getDoc(ref(db));
    if (snap.exists() && who in (snap.data().players || {})) {
      const mine = snap.data().players[who] || {};
      return updateDoc(ref(db), { [`players.${who}`]: { ...mine, name } });
    }
    return updateDoc(ref(db), { [`players.${who}`]: { name, score: 0 } });
  };
  await rejoin(dbB, B, 'Ashley');
  const after = await read();
  ok('rejoining keeps it', after.players[B].score === 7, after.players[B]);
  ok('and leaves everyone else alone', after.players[A].score === 12);

  // Changing your name on the way back in still works.
  await rejoin(dbB, B, 'Ash');
  const renamed = await read();
  ok('a new name still takes', renamed.players[B].name === 'Ash' && renamed.players[B].score === 7,
    renamed.players[B]);
}

await env.cleanup();
console.log(`\n${passes} passing, ${failures} failing\n`);
process.exit(failures ? 1 : 0);
