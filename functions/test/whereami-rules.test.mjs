/* Where Am I: the security rules, tested against the emulator.
 *
 * These rules are the only thing standing between a private deck of family
 * photos and every other signed-in visitor to the site, so they get tested
 * rather than eyeballed. The case that matters most is `catch-all` below:
 * firestore.rules ends with a rule granting any signed-in user read/write on
 * any collection NOT named in a deny list, so a new app is wide open until
 * its prefix is added there. That is an easy line to forget and an expensive
 * one to miss.
 *
 * Run: node functions/test/whereami-rules.test.mjs
 * (starts and stops its own Firestore emulator)
 */
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, arrayUnion,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);
const OWNER = 'uid_owner', FRIEND = 'uid_friend', STRANGER = 'uid_stranger';
const DECK = 'deck1';
const KEY = 'k'.repeat(64);          // what PBKDF2 would produce
const OTHER_KEY = 'z'.repeat(64);

let failures = 0, passes = 0;
const check = async (name, promise) => {
  try { await promise; console.log(`  ok   ${name}`); passes++; }
  catch (e) { console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`); failures++; }
};

const env = await initializeTestEnvironment({
  projectId: 'whereami-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: PORT },
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// Seed a deck owned by OWNER, plus the pointer its password resolves to.
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'whereami_decks', DECK), {
      name: 'Disney 2026', ownerUid: OWNER, memberUids: [OWNER],
      map: { path: `whereami/${DECK}/map.jpg`, w: 2000, h: 1400 }, tolerance: 0.08,
    });
    await setDoc(doc(db, 'whereami_keys', KEY), { deckId: DECK });
    await setDoc(doc(db, 'whereami_decks', DECK, 'rounds', 'r1'), {
      photo: { path: `whereami/${DECK}/r1.jpg`, w: 1200, h: 900 },
      answer: { x: 0.4, y: 0.6 }, label: 'Dole Whip stand', createdByUid: OWNER,
    });
  });
}

console.log('\nthe catch-all does not leak the deck');
await seed();
// firestore.rules ends with a signed-in-can-do-anything rule for collections
// not on its deny list. If whereami_* ever falls off that list these fail.
await check('a stranger cannot read a deck',
  assertFails(getDoc(doc(as(STRANGER), 'whereami_decks', DECK))));
await check('a stranger cannot read a round',
  assertFails(getDoc(doc(as(STRANGER), 'whereami_decks', DECK, 'rounds', 'r1'))));
await check('a stranger cannot write a round',
  assertFails(setDoc(doc(as(STRANGER), 'whereami_decks', DECK, 'rounds', 'r2'),
    { createdByUid: STRANGER })));
await check('a stranger cannot list the decks',
  assertFails(getDocs(collection(as(STRANGER), 'whereami_decks'))));
await check('a stranger cannot overwrite the deck',
  assertFails(setDoc(doc(as(STRANGER), 'whereami_decks', DECK), { ownerUid: STRANGER })));

console.log('\nthe pointers cannot be enumerated');
await check('a key can be fetched by exact id',
  assertSucceeds(getDoc(doc(as(STRANGER), 'whereami_keys', KEY))));
await check('but the key collection cannot be listed',
  assertFails(getDocs(collection(as(STRANGER), 'whereami_keys'))));
await check('a non-member cannot mint a key for a deck',
  assertFails(setDoc(doc(as(STRANGER), 'whereami_keys', OTHER_KEY), { deckId: DECK })));
await check('a member can mint a key',
  assertSucceeds(setDoc(doc(as(OWNER), 'whereami_keys', OTHER_KEY), { deckId: DECK })));
await check('a key cannot smuggle extra fields',
  assertFails(setDoc(doc(as(OWNER), 'whereami_keys', 'q'.repeat(64)),
    { deckId: DECK, memberUids: [STRANGER] })));

console.log('\njoining needs the key, and only adds you');
await seed();
await check('joining with a valid key works',
  assertSucceeds(updateDoc(doc(as(FRIEND), 'whereami_decks', DECK),
    { memberUids: arrayUnion(FRIEND), joinedVia: KEY })));
await seed();
await check('joining without naming a key fails',
  assertFails(updateDoc(doc(as(FRIEND), 'whereami_decks', DECK),
    { memberUids: arrayUnion(FRIEND) })));
await check('joining with a key that points elsewhere fails',
  assertFails(updateDoc(doc(as(FRIEND), 'whereami_decks', DECK),
    { memberUids: arrayUnion(FRIEND), joinedVia: 'no-such-key' })));
await check('you cannot drag a friend in with you',
  assertFails(updateDoc(doc(as(FRIEND), 'whereami_decks', DECK),
    { memberUids: arrayUnion(FRIEND, STRANGER), joinedVia: KEY })));
await check('you cannot seize ownership while joining',
  assertFails(updateDoc(doc(as(FRIEND), 'whereami_decks', DECK),
    { memberUids: arrayUnion(FRIEND), joinedVia: KEY, ownerUid: FRIEND })));
await check('you cannot evict the owner while joining',
  assertFails(updateDoc(doc(as(FRIEND), 'whereami_decks', DECK),
    { memberUids: [FRIEND], joinedVia: KEY })));

console.log('\nmembers can play, strangers still cannot');
await seed();
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'whereami_decks', DECK), { memberUids: [OWNER, FRIEND] });
});
await check('a member reads the deck', assertSucceeds(getDoc(doc(as(FRIEND), 'whereami_decks', DECK))));
await check('a member reads a round',
  assertSucceeds(getDoc(doc(as(FRIEND), 'whereami_decks', DECK, 'rounds', 'r1'))));
await check('a member adds a round',
  assertSucceeds(setDoc(doc(as(FRIEND), 'whereami_decks', DECK, 'rounds', 'r2'),
    { photo: { path: 'p', w: 1, h: 1 }, answer: { x: 0.1, y: 0.1 }, createdByUid: FRIEND })));
await check('a member cannot forge another author',
  assertFails(setDoc(doc(as(FRIEND), 'whereami_decks', DECK, 'rounds', 'r3'),
    { photo: { path: 'p', w: 1, h: 1 }, answer: { x: 0.1, y: 0.1 }, createdByUid: OWNER })));
await check('a member writes their own scorecard',
  assertSucceeds(setDoc(doc(as(FRIEND), 'whereami_decks', DECK, 'scores', FRIEND), { points: 120 })));
await check('a member cannot write someone else\'s scorecard',
  assertFails(setDoc(doc(as(FRIEND), 'whereami_decks', DECK, 'scores', OWNER), { points: 0 })));
await check('only the owner deletes the deck',
  assertFails(deleteDoc(doc(as(FRIEND), 'whereami_decks', DECK))));
await check('the owner can delete the deck',
  assertSucceeds(deleteDoc(doc(as(OWNER), 'whereami_decks', DECK))));

console.log('\nsigned out is shut out');
await seed();
await check('anonymous cannot read a deck', assertFails(getDoc(doc(anon(), 'whereami_decks', DECK))));
await check('anonymous cannot read a key', assertFails(getDoc(doc(anon(), 'whereami_keys', KEY))));

console.log('\ncreating a deck');
await env.clearFirestore();
await check('you create a deck owning it yourself',
  assertSucceeds(setDoc(doc(as(OWNER), 'whereami_decks', 'new1'),
    { ownerUid: OWNER, memberUids: [OWNER], name: 'x' })));
await check('you cannot create a deck owned by someone else',
  assertFails(setDoc(doc(as(OWNER), 'whereami_decks', 'new2'),
    { ownerUid: STRANGER, memberUids: [STRANGER], name: 'x' })));
await check('you cannot create a deck pre-stuffed with members',
  assertFails(setDoc(doc(as(OWNER), 'whereami_decks', 'new3'),
    { ownerUid: OWNER, memberUids: [OWNER, STRANGER], name: 'x' })));

console.log('\nthe per-browser deck list is private');
await check('you write your own list',
  assertSucceeds(setDoc(doc(as(OWNER), 'whereami_users', OWNER), { decks: ['new1'] })));
await check('you cannot read another browser\'s list',
  assertFails(getDoc(doc(as(STRANGER), 'whereami_users', OWNER))));

await env.cleanup();
console.log(`\n${passes} passing, ${failures} failing\n`);
process.exit(failures ? 1 : 0);
