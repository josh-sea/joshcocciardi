/* Roy: the Realtime Database rules for /roy, tested against the emulator.
 *
 * Roy shares the josh-cocciardi database and user pool with the other apps,
 * so these rules are what keep one player out of another's games and keep
 * paid features (/roy/users/{uid}/features) server-only.
 *
 * Run from the repo root (starts and stops its own emulator):
 *   npx firebase-tools emulators:exec --only database --project demo-roy \
 *     "node apps/roy/functions/test/rules.test.mjs"
 */
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';
import { readFileSync } from 'node:fs';

const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
const A = 'uid_a', B = 'uid_b', C = 'uid_c';

let failures = 0, passes = 0;
const check = async (name, promise) => {
  try { await promise; console.log(`  ok   ${name}`); passes++; }
  catch (e) { console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`); failures++; }
};

const env = await initializeTestEnvironment({
  projectId: 'demo-roy',
  database: { rules: readFileSync('database.rules.json', 'utf8'), host, port: Number(port) },
});

const db = (uid) => (uid
  ? env.authenticatedContext(uid, { email: `${uid}@example.com` })
  : env.unauthenticatedContext()).database();
const r = (uid, path) => ref(db(uid), `roy/${path}`);

const profile = (uid) => ({ username: uid.slice(-1), email: `${uid}@example.com`, friendCode: '12345678' });
const game = { name: 'g', player1: A, player2: B, grid: '', turn: 1, boardSize: '10x10' };

console.log('profiles');
await check('owner creates profile with update()', assertSucceeds(update(r(A, `users/${A}`), profile(A))));
await check('owner cannot set() the whole node', assertFails(set(r(A, `users/${A}`), profile(A))));
await check('someone else cannot write my profile', assertFails(update(r(B, `users/${A}`), { username: 'x' })));
await check('email must match the signed-in account', assertFails(update(r(A, `users/${A}`), { email: 'x@example.com' })));
await check('username over 16 chars rejected', assertFails(update(r(A, `users/${A}`), { username: 'x'.repeat(17) })));
await check('signed-in users can search profiles', assertSucceeds(get(r(C, 'users'))));
await check('signed-out visitors cannot read profiles', assertFails(get(r(null, 'users'))));
await check('owner adds a friend', assertSucceeds(set(r(A, `users/${A}/friends/${B}`), true)));
await check('owner removes a friend', assertSucceeds(remove(r(A, `users/${A}/friends/${B}`))));
await check('owner toggles a notification pref', assertSucceeds(update(r(A, `users/${A}/notifications`), { turns: false })));
await check('unknown notification pref rejected', assertFails(update(r(A, `users/${A}/notifications`), { spam: true })));
await check('owner saves a push token', assertSucceeds(set(r(A, `users/${A}/pushToken`), 'ExponentPushToken[x]')));
await check('owner saves a web push token', assertSucceeds(set(r(A, `users/${A}/webPushTokens/fcm:tok_1`), true)));
await check('someone else cannot add a web push token for me', assertFails(set(r(B, `users/${A}/webPushTokens/fcm:tok_2`), true)));
await check('web push token entries are just true', assertFails(set(r(A, `users/${A}/webPushTokens/fcm:tok_3`), 'x')));
await check('owner cannot grant themselves features', assertFails(set(r(A, `users/${A}/features/unlimitedGames`), true)));
await check('owner cannot sneak features in via update()', assertFails(update(r(A, `users/${A}`), { 'features/deathmatch': true })));

console.log('games');
await check('player1 creates a game', assertSucceeds(set(r(A, 'games/g1'), game)));
await check('cannot create a game as someone else', assertFails(set(r(C, 'games/g2'), game)));
await check('player2 takes a turn', assertSucceeds(set(r(B, 'games/g1/turn'), 1)));
await check('player1 writes the grid', assertSucceeds(set(r(A, 'games/g1/grid'), { 0: 1 })));
await check('a whole move saves in one update()', assertSucceeds(update(r(B, 'games/g1'), { grid: { 3: 5 }, selected: 3, turn: 1, lastMove: { id: 'm1', by: 2, index: 3, shape: 'classic', anim: 'wave' } })));
await check('player sends trash talk', assertSucceeds(set(r(B, 'games/g1/message'), { sender: 2, value: 'hi' })));
await check('outsider cannot touch the game', assertFails(set(r(C, 'games/g1/turn'), 2)));
await check('players cannot be swapped out', assertFails(set(r(A, 'games/g1/player2'), C)));
await check('signed-in users can list games', assertSucceeds(get(r(C, 'games'))));
await check('outsider cannot delete the game', assertFails(remove(r(C, 'games/g1'))));
await check('a player deletes the game', assertSucceeds(remove(r(B, 'games/g1'))));

console.log('namespace');
await check('nothing outside /roy is opened up', assertFails(set(ref(db(A), 'users/x'), 1)));

await env.cleanup();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
