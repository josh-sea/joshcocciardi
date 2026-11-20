// End-to-end test of the Verdict functions and rules together, against the
// emulators: usernames, search, invites, requests, the fan-out index and
// feed, backfill on accept, cleanup on remove and block, mutual counts, and
// account deletion. TMDB is not called.
//
//   # one terminal: an emulator project with only the verdict codebase, e.g.
//   #   firebase.json → { "firestore": {"rules": "firestore.rules"},
//   #                     "functions": [{"source": "apps/verdict/functions", "codebase": "verdict"}] }
//   firebase emulators:start --only auth,firestore,functions --project josh-cocciardi
//
//   # another
//   cd apps/verdict && npm i --no-save firebase@12 && node test/functions-flow.test.mjs

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const PROJECT = "josh-cocciardi";
let pass = 0;
let fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) { pass++; console.log("  PASS", label); } else { fail++; console.log("  FAIL", label, extra); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) return v;
    await wait(300);
  }
}

const stamp = Date.now().toString(36);
async function person(name, discoverable = true) {
  const app = initializeApp({ apiKey: "fake", projectId: PROJECT }, `${name}-${stamp}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const fns = getFunctions(app, "us-central1");
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  const cred = await createUserWithEmailAndPassword(auth, `${name}-${stamp}@example.com`, "password123");
  const uid = cred.user.uid;
  await setDoc(doc(db, "verdict_users", uid), {
    displayName: "", avatarUrl: null, discoverable, shareWantList: false, region: "US", services: [], onboarded: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const call = (n, d = {}) => httpsCallable(fns, n)(d).then((r) => r.data);
  return { name, uid, db, call };
}

const pair = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
const request = (from, to, via = "search") =>
  setDoc(doc(from.db, "verdict_connections", pair(from.uid, to.uid)), {
    users: [from.uid, to.uid].sort(), requestedBy: from.uid, status: "pending", via, createdAt: serverTimestamp(),
  });
const accept = (me, other) => updateDoc(doc(me.db, "verdict_connections", pair(me.uid, other.uid)), { status: "accepted", respondedAt: serverTimestamp() });

const BEAR = { mediaType: "tv", tmdbId: 136315, titleKey: "tv_136315", title: { name: "The Bear", year: 2022, posterPath: "/b.jpg" } };
const MATRIX = { mediaType: "movie", tmdbId: 603, titleKey: "movie_603", title: { name: "The Matrix", year: 1999, posterPath: "/m.jpg" } };

async function rate(p, t, rating, note = "") {
  const ref = doc(p.db, "verdict_ratings", `${p.uid}__${t.titleKey}`);
  const snap = await getDoc(ref);
  const now = Timestamp.now();
  const base = { uid: p.uid, titleKey: t.titleKey, mediaType: t.mediaType, tmdbId: t.tmdbId, rating, note, tags: [], whileWatching: false, title: t.title, updatedAt: now };
  if (!snap.exists()) return setDoc(ref, { ...base, history: [], createdAt: now });
  const prev = snap.data();
  return setDoc(ref, { ...base, createdAt: prev.createdAt, history: [...prev.history, { rating: prev.rating, note: prev.note, tags: prev.tags, at: prev.updatedAt }] });
}
const activity = (p, t) => getDoc(doc(p.db, "verdict_activity", p.uid, "titles", t.titleKey)).then((s) => (s.exists() ? s.data() : null));
const feed = (p) => getDocs(query(collection(p.db, "verdict_feeds", p.uid, "items"), orderBy("at", "desc"))).then((s) => s.docs.map((d) => d.data()));

const alice = await person("alice");
const bob = await person("bob", false); // private
const carol = await person("carol");
const dan = await person("dan");

console.log("Usernames");
ok("alice claims a username", (await alice.call("verdictClaimUsername", { username: `alice${stamp}`, displayName: "Alice" })).ok);
const taken = await bob.call("verdictClaimUsername", { username: `alice${stamp}` });
ok("a taken username is refused", taken.ok === false && /taken/.test(taken.reason));
ok("a bad username is refused", (await bob.call("verdictClaimUsername", { username: "admin" })).ok === false);
ok("bob claims his", (await bob.call("verdictClaimUsername", { username: `bob${stamp}`, displayName: "Bob" })).ok);
ok("carol claims hers", (await carol.call("verdictClaimUsername", { username: `carol${stamp}`, displayName: "Carol" })).ok);
ok("dan claims his", (await dan.call("verdictClaimUsername", { username: `dan${stamp}`, displayName: "Dan" })).ok);
let changed = null;
try { await alice.call("verdictClaimUsername", { username: `al${stamp}` }); } catch (e) { changed = e; }
ok("a username can't be changed", changed && /can't be changed/.test(changed.message));

console.log("Search");
const found = await alice.call("verdictSearchUsers", { query: `carol${stamp}` });
ok("public accounts show up", found.results.some((r) => r.uid === carol.uid && r.connection === "none"));
const hidden = await alice.call("verdictSearchUsers", { query: `bob${stamp}` });
ok("private accounts don't", hidden.results.length === 0);

console.log("Invites and requests");
const code = (await bob.call("verdictInviteCode")).code;
ok("bob gets an invite code", /^[A-HJ-NP-Z2-9]{8}$/.test(code));
ok("asking again returns the same code", (await bob.call("verdictInviteCode")).code === code);
const redeemed = await alice.call("verdictRedeemInvite", { code });
ok("redeeming sends a pending request", redeemed.connection === "pending_out" && redeemed.profile.uid === bob.uid);
await accept(bob, alice);
await request(alice, carol);
await accept(carol, alice);
ok("search now shows carol as a friend", (await alice.call("verdictSearchUsers", { query: `carol${stamp}` })).results[0].connection === "friends");

console.log("Fan-out");
await rate(bob, BEAR, "up", "Skip episode 1");
await rate(carol, BEAR, "down");
const a1 = await until(async () => { const a = await activity(alice, BEAR); return a && a.upCount === 1 && a.downCount === 1 && a; });
ok("alice's index has both verdicts", Boolean(a1), JSON.stringify(await activity(alice, BEAR)));
ok("the note comes along", a1 && a1.ratings[bob.uid].note === "Skip episode 1");
ok("the title snapshot comes along", a1 && a1.title && a1.title.name === "The Bear");
const f1 = await until(async () => { const f = await feed(alice); return f.length >= 2 && f; });
ok("alice's feed has two items", f1 && f1.length === 2);

await rate(bob, BEAR, "meh", "Skip episode 1");
const a2 = await until(async () => { const a = await activity(alice, BEAR); return a && a.ratings[bob.uid].rating === "meh" && a; });
ok("a changed verdict updates the index", a2 && a2.upCount === 0 && a2.mehCount === 1);
const f2 = await until(async () => { const f = await feed(alice); return f.find((i) => i.type === "rerated") && f; });
ok("and adds a 'rerated' feed item", Boolean(f2));
await rate(bob, BEAR, "meh", "Actually episode 2 too");
await wait(2500);
ok("a note-only edit doesn't add a feed item", (await feed(alice)).length === 3);

await setDoc(doc(bob.db, "verdict_lists", `${bob.uid}__${BEAR.titleKey}`), {
  uid: bob.uid, titleKey: BEAR.titleKey, mediaType: "tv", tmdbId: BEAR.tmdbId, status: "watching", title: BEAR.title, startedAt: Timestamp.now(), updatedAt: Timestamp.now(),
});
const a3 = await until(async () => { const a = await activity(alice, BEAR); return a && a.watchingCount === 1 && a; });
ok("watching fans out", Boolean(a3 && a3.watching[bob.uid]));
ok("and makes a 'started' feed item", Boolean(await until(async () => (await feed(alice)).find((i) => i.type === "started"))));

console.log("Backfill on accept");
await rate(dan, MATRIX, "up");
await wait(500);
await request(dan, alice);
await accept(alice, dan);
const a4 = await until(async () => { const a = await activity(alice, MATRIX); return a && a.ratings[dan.uid] && a; });
ok("dan's earlier verdict reaches alice", Boolean(a4));
const d4 = await until(async () => { const a = await activity(dan, BEAR); return a && a.ratings[bob.uid] === undefined && a.ratings[carol.uid] === undefined ? null : a; }, 3000);
ok("but friends of friends don't reach dan", !d4);

console.log("Mutual friends");
await request(bob, carol);
await accept(carol, bob);
ok("alice and bob have carol in common", (await alice.call("verdictMutualCount", { uid: bob.uid })).count === 1);
let denied = null;
try { await bob.call("verdictMutualCount", { uid: dan.uid }); } catch (e) { denied = e; }
ok("mutual count is only for friends and requests", Boolean(denied));

console.log("Remove and block");
await deleteDoc(doc(alice.db, "verdict_connections", pair(alice.uid, carol.uid)));
const a5 = await until(async () => { const a = await activity(alice, BEAR); return a && !a.ratings[carol.uid] && a; });
ok("removing carol takes her out of alice's index", Boolean(a5) && a5.downCount === 0);
ok("and out of alice's feed", Boolean(await until(async () => !(await feed(alice)).some((i) => i.actorUid === carol.uid))));

await bob.call("verdictBlock", { uid: alice.uid });
ok("blocking removes the connection", !(await getDoc(doc(alice.db, "verdict_connections", pair(alice.uid, bob.uid))).catch(() => ({ exists: () => false }))).exists());
ok("and bob leaves alice's index", Boolean(await until(async () => (await activity(alice, BEAR)) === null)));
let blocked = null;
try { await request(alice, bob, "invite"); } catch (e) { blocked = e; }
ok("alice can't send bob a request", Boolean(blocked));
let blockedInvite = null;
try { await alice.call("verdictRedeemInvite", { code }); } catch (e) { blockedInvite = e; }
ok("or use his invite code", Boolean(blockedInvite));
ok("bob sees alice on his blocked list", (await bob.call("verdictBlockedList")).results.some((p) => p.uid === alice.uid));
await bob.call("verdictUnblock", { uid: alice.uid });
ok("unblock clears it", (await bob.call("verdictBlockedList")).results.length === 0);

console.log("Delete account");
await dan.call("verdictDeleteAccount");
ok("dan's verdict leaves alice's index", Boolean(await until(async () => (await activity(alice, MATRIX)) === null)));
ok("dan's connection is gone", !(await getDoc(doc(alice.db, "verdict_connections", pair(alice.uid, dan.uid)))).exists());
ok("dan's profile is gone", !(await getDoc(doc(alice.db, "verdict_users", dan.uid))).exists());
ok("dan's username is free again", (await alice.call("verdictClaimUsername", { username: `dan${stamp}`, check: true })).available);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
