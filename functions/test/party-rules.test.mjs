/* Party Room: the Realtime Database rules, tested against the emulator.
 *
 * Every phone has to read the room, so the only things keeping a trivia
 * answer, a Chips & Dip hand or the word being drawn private are these
 * rules. Checked here:
 *   1. rooms cannot be listed, so a code is the only way in
 *   2. the vault is the host's alone, and each secret and note its owner's
 *   3. only the host writes the game; players can only post as themselves
 *   4. only the current drawer (or the host) can touch the drawing
 *   5. the host's seat can be taken only once the host has gone offline
 *
 * Run (from the repo root):
 *   npx firebase-tools@13 emulators:start --only database --project party-rules-test
 *   node functions/test/party-rules.test.mjs
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update, push, remove } from 'firebase/database';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.DATABASE_EMULATOR_PORT || 9000);
const HOST = 'uid_host', BO = 'uid_bo', CAM = 'uid_cam', STRANGER = 'uid_stranger';
const CODE = 'ABCDE';
const room = (p = '') => `party/rooms/${CODE}${p ? '/' + p : ''}`;

let failures = 0, passes = 0;
const check = async (name, promise) => {
  try { await promise; console.log(`  ok   ${name}`); passes++; }
  catch (e) { console.log(`  FAIL ${name} — ${String(e.message).split('\n')[0]}`); failures++; }
};

const env = await initializeTestEnvironment({
  projectId: 'party-rules-test',
  database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: PORT },
});
const db = (uid) => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();

async function seed({ hostOnline = true } = {}) {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), room()), {
      meta: { host: HOST, created: 1 },
      players: {
        [HOST]: { name: 'Josh', joined: 1, online: hostOnline },
        [BO]: { name: 'Bo', joined: 2, online: true },
        [CAM]: { name: 'Cam', joined: 3, online: true },
      },
      game: { game: 'sketch', phase: 'drawing', drawer: BO },
      vault: { word: 'octopus' },
      secret: { [BO]: { word: 'octopus' }, [CAM]: { hand: ['A cat'] } },
      notes: { [CAM]: { text: 'So close!', at: 1 } },
      strokes: { s1: { s: 1, c: 0, w: 1, p: [1, 2, 3, 4] } },
    });
  });
}

console.log('\nreading');
await seed();
await check('nobody can list rooms', assertFails(get(ref(db(STRANGER), 'party/rooms'))));
await check('nobody can read a whole room at once', assertFails(get(ref(db(BO), room()))));
await check('signed out, nothing is readable', assertFails(get(ref(anon(), room('game')))));
await check('anyone with the code reads the game', assertSucceeds(get(ref(db(STRANGER), room('game')))));
await check('and the players', assertSucceeds(get(ref(db(CAM), room('players')))));
await check('a code outside the alphabet is refused', assertFails(get(ref(db(BO), 'party/rooms/ABCD0/game'))));
await check('the host reads the vault', assertSucceeds(get(ref(db(HOST), room('vault')))));
await check('the drawer cannot read the vault', assertFails(get(ref(db(BO), room('vault')))));
await check('a guesser cannot read the vault', assertFails(get(ref(db(CAM), room('vault')))));
await check('the drawer reads their own secret', assertSucceeds(get(ref(db(BO), room(`secret/${BO}`)))));
await check("a guesser cannot read the drawer's secret", assertFails(get(ref(db(CAM), room(`secret/${BO}`)))));
await check('nobody reads all the secrets at once', assertFails(get(ref(db(HOST), room('secret')))));
await check("a note is its owner's alone", assertFails(get(ref(db(BO), room(`notes/${CAM}`)))));
await check('only the host reads the inbox', assertFails(get(ref(db(BO), room('inbox')))));

console.log('\nwriting');
await seed();
await check('the host writes the game', assertSucceeds(set(ref(db(HOST), room('game/phase')), 'reveal')));
await check('a player cannot write the game', assertFails(set(ref(db(CAM), room('game/phase')), 'over')));
await check('a player cannot write a secret', assertFails(set(ref(db(CAM), room(`secret/${CAM}`)), { hand: ['x'] })));
await check('a player cannot write the vault', assertFails(set(ref(db(BO), room('vault')), {})));
await check('a player posts to the inbox as themselves', assertSucceeds(push(ref(db(CAM), room('inbox')), { uid: CAM, t: 'guess', text: 'cake' })));
await check('but not as somebody else', assertFails(push(ref(db(CAM), room('inbox')), { uid: BO, t: 'guess', text: 'cake' })));
await check('a stranger who has not joined cannot post', assertFails(push(ref(db(STRANGER), room('inbox')), { uid: STRANGER, t: 'guess' })));
await check('a player updates their own entry', assertSucceeds(update(ref(db(CAM), room(`players/${CAM}`)), { online: false, leftAt: 5 })));
await check("but not someone else's", assertFails(update(ref(db(CAM), room(`players/${BO}`)), { name: 'Bob' })));
await check('a name over 24 characters is refused', assertFails(set(ref(db(STRANGER), room(`players/${STRANGER}`)), { name: 'x'.repeat(25), joined: 9, online: true })));
await check('a stranger can join with a name', assertSucceeds(set(ref(db(STRANGER), room(`players/${STRANGER}`)), { name: 'Grammy', joined: 9, online: true })));
await check('nobody adds odd fields to the room', assertFails(set(ref(db(HOST), room('junk')), 1)));

console.log('\nthe drawing');
await seed();
await check('the drawer draws', assertSucceeds(push(ref(db(BO), room('strokes')), { s: 2, c: 1, w: 1, p: [5, 5] })));
await check('the drawer clears', assertSucceeds(remove(ref(db(BO), room('strokes')))));
await check('a guesser cannot draw', assertFails(push(ref(db(CAM), room('strokes')), { s: 3, p: [1, 1] })));
await check('the host clears between turns', assertSucceeds(remove(ref(db(HOST), room('strokes')))));

console.log('\nthe host seat');
await seed();
await check('a new room can be made by anyone', assertSucceeds(set(ref(db(STRANGER), 'party/rooms/ZZZZZ/meta'), { host: STRANGER, created: 1 })));
await check("an existing room can't be taken over by remaking it", assertFails(set(ref(db(BO), room('meta')), { host: BO, created: 2 })));
await check('the host seat cannot be taken while the host is online', assertFails(set(ref(db(BO), room('meta/host')), BO)));
await seed({ hostOnline: false });
await check('a stranger cannot take it even when the host is away', assertFails(set(ref(db(STRANGER), room('meta/host')), STRANGER)));
await check('nobody can hand it to someone else', assertFails(set(ref(db(CAM), room('meta/host')), BO)));
await check('a player takes it once the host has gone', assertSucceeds(set(ref(db(BO), room('meta/host')), BO)));
await check('and can then read the vault', assertSucceeds(get(ref(db(BO), room('vault')))));
await check('while the old host no longer can', assertFails(get(ref(db(HOST), room('vault')))));

await env.cleanup();
console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
