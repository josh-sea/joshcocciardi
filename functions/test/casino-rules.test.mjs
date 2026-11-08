/* Casino: the Realtime Database rules, tested against the emulator.
 *
 * Every phone at a blackjack table reads the table, so the only thing
 * keeping the shoe and the dealer's hole card private is these rules.
 * Checked here:
 *   1. tables cannot be listed, so a code is the only way in
 *   2. the vault (shoe and hole card) is the host's alone
 *   3. only the host writes the table; players post moves only as
 *      themselves, and only once they have joined
 *   4. the host's seat can be taken only once the host has gone offline
 *
 * Run (from the repo root):
 *   npx firebase-tools@13 emulators:start --only database --project casino-rules-test
 *   node functions/test/casino-rules.test.mjs
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, push, remove } from 'firebase/database';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.DATABASE_EMULATOR_PORT || 9000);
const HOST = 'uid_host', BO = 'uid_bo', CAM = 'uid_cam', STRANGER = 'uid_stranger';
const CODE = 'ABCDE';
const table = (p = '') => `casino/tables/${CODE}${p ? '/' + p : ''}`;

let failures = 0, passes = 0;
const check = async (name, promise) => {
  try { await promise; console.log(`  ok   ${name}`); passes++; }
  catch (e) { console.log(`  FAIL ${name} — ${String(e.message).split('\n')[0]}`); failures++; }
};

const env = await initializeTestEnvironment({
  projectId: 'casino-rules-test',
  database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: PORT },
});
const db = (uid) => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();

async function seed({ hostOnline = true } = {}) {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), table()), {
      meta: { host: HOST, created: 1 },
      players: {
        [HOST]: { name: 'Josh', joined: 1, online: hostOnline },
        [BO]: { name: 'Bo', joined: 2, online: true },
        [CAM]: { name: 'Cam', joined: 3, online: true },
      },
      game: { game: 'blackjack', phase: 'play', dealer: { cards: ['As', '??'] } },
      vault: { hole: 'Kd', shoe: ['2s', '3h'] },
      inbox: { m1: { uid: CAM, t: 'hit' } },
    });
  });
}

console.log('\nreading');
await seed();
await check('nobody can list tables', assertFails(get(ref(db(STRANGER), 'casino/tables'))));
await check('nobody can read a whole table at once', assertFails(get(ref(db(BO), table()))));
await check('signed out, nothing is readable', assertFails(get(ref(anon(), table('game')))));
await check('anyone with the code reads the table', assertSucceeds(get(ref(db(STRANGER), table('game')))));
await check('and who is sitting there', assertSucceeds(get(ref(db(CAM), table('players')))));
await check('a code outside the alphabet is refused', assertFails(get(ref(db(BO), 'casino/tables/ABCD0/game'))));
await check('the host reads the vault', assertSucceeds(get(ref(db(HOST), table('vault')))));
await check('a player cannot see the hole card', assertFails(get(ref(db(BO), table('vault/hole')))));
await check('or the shoe', assertFails(get(ref(db(CAM), table('vault/shoe')))));
await check('only the host reads the inbox', assertFails(get(ref(db(BO), table('inbox')))));

console.log('\nwriting');
await seed();
await check('the host writes the table', assertSucceeds(set(ref(db(HOST), table('game/phase')), 'dealer')));
await check('a player cannot write the table', assertFails(set(ref(db(CAM), table('game/seats/uid_cam/bank')), 1000000)));
await check('a player cannot write the vault', assertFails(set(ref(db(CAM), table('vault/shoe')), ['As', 'Kd'])));
await check('a player posts a move as themselves', assertSucceeds(push(ref(db(CAM), table('inbox')), { uid: CAM, t: 'hit' })));
await check('but not as somebody else', assertFails(push(ref(db(CAM), table('inbox')), { uid: BO, t: 'stand' })));
await check('a stranger who has not joined cannot post', assertFails(push(ref(db(STRANGER), table('inbox')), { uid: STRANGER, t: 'sit' })));
await check('a move needs a short type', assertFails(push(ref(db(CAM), table('inbox')), { uid: CAM, t: 'x'.repeat(40) })));
await check('a player updates their own presence', assertSucceeds(set(ref(db(BO), table(`players/${BO}/online`)), false)));
await check("but not someone else's", assertFails(set(ref(db(BO), table(`players/${CAM}/online`)), false)));
await check('junk on a player is refused', assertFails(set(ref(db(BO), table(`players/${BO}/bank`)), 5)));
await check('nothing else can be added to a table', assertFails(set(ref(db(HOST), table('extra')), 1)));

console.log('\nthe host seat');
await seed();
await check('a new table can be opened by anyone', assertSucceeds(set(ref(db(STRANGER), 'casino/tables/ZZZZZ/meta'), { host: STRANGER, created: 1 })));
await check("an existing table can't be taken over by reopening it", assertFails(set(ref(db(BO), table('meta')), { host: BO, created: 2 })));
await check('the host seat cannot be taken while the host is online', assertFails(set(ref(db(BO), table('meta/host')), BO)));
await seed({ hostOnline: false });
await check('a stranger cannot take it even when the host is away', assertFails(set(ref(db(STRANGER), table('meta/host')), STRANGER)));
await check('nobody can hand it to someone else', assertFails(set(ref(db(CAM), table('meta/host')), BO)));
await check('a player takes it once the host has gone', assertSucceeds(set(ref(db(BO), table('meta/host')), BO)));
await check('and can now read the shoe', assertSucceeds(get(ref(db(BO), table('vault')))));
await check('while the old host no longer can', assertFails(get(ref(db(HOST), table('vault')))));
await check('the new host takes a move off the inbox', assertSucceeds(remove(ref(db(BO), table('inbox/m1')))));
await check('a player cannot delete moves', assertFails(remove(ref(db(CAM), table('inbox/m1')))));

await env.cleanup();
console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
