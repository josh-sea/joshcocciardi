// Firestore security-rules tests for Verdict. They prove that ratings and
// lists are only visible to accepted friends, that star/mute and the
// function-owned collections are private, that friend requests follow the
// pending → accepted flow, and that rating history can't be rewritten.
//
// Needs the Firestore emulator running against the repo's real rules:
//
//   # from the repo root, in one terminal
//   firebase emulators:start --only firestore --project josh-cocciardi
//
//   # in another
//   cd apps/verdict && npm i --no-save @firebase/rules-unit-testing firebase@12
//   node test/verdict-rules.test.mjs

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, Timestamp } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "josh-cocciardi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
});
await env.clearFirestore();

const as = (uid) => env.authenticatedContext(uid).firestore();
const a = as("alice");
const b = as("bob");
const c = as("carol");
const anon = env.unauthenticatedContext().firestore();

let pass = 0;
let fail = 0;
const check = async (label, p) => {
  try {
    await p;
    console.log("  PASS", label);
    pass++;
  } catch (err) {
    console.log("  FAIL", label, "\n      ", err.message.split("\n")[0]);
    fail++;
  }
};

const t0 = Timestamp.fromMillis(1_700_000_000_000);
const t1 = Timestamp.fromMillis(1_700_000_100_000);
const title = { name: "The Bear", year: 2022, posterPath: "/p.jpg" };
const rating = (uid, over = {}) => ({
  uid, titleKey: "tv_136315", mediaType: "tv", tmdbId: 136315, rating: "up", note: "", tags: [],
  whileWatching: false, title, history: [], createdAt: t0, updatedAt: t0, ...over,
});
const list = (uid, status) => ({
  uid, titleKey: "tv_136315", mediaType: "tv", tmdbId: 136315, status, title, updatedAt: t0,
});

// Seed: alice and bob are friends, carol is a stranger. Bob blocked carol.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "verdict_users/alice"), { username: "alice", displayName: "Alice", discoverable: true });
  await setDoc(doc(db, "verdict_users/bob"), { username: "bob", displayName: "Bob", discoverable: false });
  await setDoc(doc(db, "verdict_users/carol"), { username: "carol", displayName: "Carol", discoverable: true });
  await setDoc(doc(db, "verdict_connections/alice__bob"), { users: ["alice", "bob"], requestedBy: "alice", status: "accepted" });
  await setDoc(doc(db, "verdict_users/bob/private/blocks"), { blocked: { carol: true } });
  await setDoc(doc(db, "verdict_ratings/bob__tv_136315"), rating("bob"));
  await setDoc(doc(db, "verdict_lists/bob__tv_136315"), list("bob", "watching"));
  await setDoc(doc(db, "verdict_lists/bob__movie_603"), { ...list("bob", "want"), titleKey: "movie_603", mediaType: "movie", tmdbId: 603 });
  await setDoc(doc(db, "verdict_activity/alice/titles/tv_136315"), { ratings: { bob: { rating: "up" } } });
  await setDoc(doc(db, "verdict_feeds/alice/items/x"), { actorUid: "bob" });
  await setDoc(doc(db, "verdict_usernames/bob"), { uid: "bob" });
  await setDoc(doc(db, "verdict_invites/ABCDEFGH"), { uid: "bob" });
});

console.log("Profiles");
await check("a signed-in user can get a profile", assertSucceeds(getDoc(doc(c, "verdict_users/bob"))));
await check("nobody can list profiles (private accounts stay hidden)", assertFails(getDocs(collection(c, "verdict_users"))));
await check("signed-out clients can't read profiles", assertFails(getDoc(doc(anon, "verdict_users/bob"))));
await check("you can't set your own username", assertFails(updateDoc(doc(a, "verdict_users/alice"), { username: "admin" })));
await check("you can change your display name", assertSucceeds(updateDoc(doc(a, "verdict_users/alice"), { displayName: "Al" })));
await check("you can't edit someone else's profile", assertFails(updateDoc(doc(c, "verdict_users/alice"), { displayName: "x" })));
await check("a new profile can't arrive with a username", assertFails(setDoc(doc(as("dan"), "verdict_users/dan"), { username: "dan" })));
await check("a new profile without a username is fine", assertSucceeds(setDoc(doc(as("dan"), "verdict_users/dan"), { displayName: "Dan", discoverable: true })));

console.log("Private docs");
await check("owner writes their prefs", assertSucceeds(setDoc(doc(a, "verdict_users/alice/private/prefs"), { starred: { bob: true }, muted: {} })));
await check("a friend can't read your prefs", assertFails(getDoc(doc(b, "verdict_users/alice/private/prefs"))));
await check("you can't write your own blocks doc", assertFails(setDoc(doc(a, "verdict_users/alice/private/blocks"), { blocked: {} })));
await check("usernames are not readable", assertFails(getDoc(doc(a, "verdict_usernames/bob"))));
await check("invites are not readable", assertFails(getDoc(doc(a, "verdict_invites/ABCDEFGH"))));

console.log("Ratings");
await check("a friend reads a rating", assertSucceeds(getDoc(doc(a, "verdict_ratings/bob__tv_136315"))));
await check("a friend queries ratings by uid", assertSucceeds(getDocs(query(collection(a, "verdict_ratings"), where("uid", "==", "bob")))));
await check("a stranger can't read a rating", assertFails(getDoc(doc(c, "verdict_ratings/bob__tv_136315"))));
await check("a stranger can't query ratings", assertFails(getDocs(query(collection(c, "verdict_ratings"), where("uid", "==", "bob")))));
await check("you can rate", assertSucceeds(setDoc(doc(a, "verdict_ratings/alice__tv_136315"), rating("alice"))));
await check("you can't rate as someone else", assertFails(setDoc(doc(c, "verdict_ratings/alice__movie_603"), { ...rating("alice"), titleKey: "movie_603", mediaType: "movie", tmdbId: 603 })));
await check("the id has to match the title", assertFails(setDoc(doc(a, "verdict_ratings/alice__movie_1"), rating("alice"))));
await check("rating must be up, meh or down", assertFails(setDoc(doc(c, "verdict_ratings/carol__tv_136315"), rating("carol", { rating: "love" }))));
await check("notes are capped at 280", assertFails(setDoc(doc(c, "verdict_ratings/carol__tv_136315"), rating("carol", { note: "x".repeat(281) }))));
await check(
  "changing a rating appends the old version",
  assertSucceeds(updateDoc(doc(a, "verdict_ratings/alice__tv_136315"), {
    rating: "meh", updatedAt: t1, history: [{ rating: "up", note: "", tags: [], at: t0 }],
  })),
);
await check(
  "history can't be wiped",
  assertFails(updateDoc(doc(a, "verdict_ratings/alice__tv_136315"), { rating: "down", updatedAt: t1, history: [] })),
);
await check(
  "history can't be rewritten",
  assertFails(updateDoc(doc(a, "verdict_ratings/alice__tv_136315"), {
    rating: "down", updatedAt: t1,
    history: [{ rating: "down", note: "", tags: [], at: t0 }, { rating: "meh", note: "", tags: [], at: t1 }],
  })),
);
{
  const full = Array.from({ length: 20 }, (_, i) => ({ rating: "up", note: String(i), tags: [], at: t0 }));
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "verdict_ratings/alice__movie_603"), { ...rating("alice"), titleKey: "movie_603", mediaType: "movie", tmdbId: 603, history: full, note: "now" }),
  );
  await check(
    "at 20 entries the oldest drops off",
    assertSucceeds(updateDoc(doc(a, "verdict_ratings/alice__movie_603"), {
      rating: "down", updatedAt: t1, history: [...full.slice(1), { rating: "up", note: "now", tags: [], at: t0 }],
    })),
  );
}
await check("you can un-rate", assertSucceeds(deleteDoc(doc(a, "verdict_ratings/alice__movie_603"))));
await check("a friend can't delete your rating", assertFails(deleteDoc(doc(a, "verdict_ratings/bob__tv_136315"))));

console.log("Lists");
await check("a friend sees what you're watching", assertSucceeds(getDoc(doc(a, "verdict_lists/bob__tv_136315"))));
await check("a friend can't see Want to watch by default", assertFails(getDoc(doc(a, "verdict_lists/bob__movie_603"))));
await check(
  "a friend queries what you're watching",
  assertSucceeds(getDocs(query(collection(a, "verdict_lists"), where("uid", "==", "bob"), where("status", "==", "watching")))),
);
await check("a stranger can't see your lists", assertFails(getDoc(doc(c, "verdict_lists/bob__tv_136315"))));
await check("you can add to your list", assertSucceeds(setDoc(doc(a, "verdict_lists/alice__tv_136315"), list("alice", "want"))));
await check("status must be one of the four", assertFails(setDoc(doc(a, "verdict_lists/alice__tv_136315"), list("alice", "binging"))));
await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "verdict_users/bob"), { shareWantList: true }));
await check("with shareWantList on, friends see Want to watch", assertSucceeds(getDoc(doc(a, "verdict_lists/bob__movie_603"))));

console.log("Connections");
await check("you can send a request", assertSucceeds(setDoc(doc(c, "verdict_connections/alice__carol"), { users: ["alice", "carol"], requestedBy: "carol", status: "pending", via: "search" })));
await check("the requester can't accept their own request", assertFails(updateDoc(doc(c, "verdict_connections/alice__carol"), { status: "accepted" })));
await check("a pending request doesn't unlock ratings", assertFails(getDoc(doc(c, "verdict_ratings/alice__tv_136315"))));
await check("the other person accepts", assertSucceeds(updateDoc(doc(a, "verdict_connections/alice__carol"), { status: "accepted" })));
await check("once accepted, ratings are readable", assertSucceeds(getDoc(doc(c, "verdict_ratings/alice__tv_136315"))));
await check("a request can't be created already accepted", assertFails(setDoc(doc(as("dan"), "verdict_connections/alice__dan"), { users: ["alice", "dan"], requestedBy: "dan", status: "accepted" })));
await check("someone you blocked can't send you a request", assertFails(setDoc(doc(c, "verdict_connections/bob__carol"), { users: ["bob", "carol"], requestedBy: "carol", status: "pending", via: "invite" })));
await check("outsiders can't read a connection", assertFails(getDoc(doc(as("dan"), "verdict_connections/alice__bob"))));
await check("either side can remove", assertSucceeds(deleteDoc(doc(c, "verdict_connections/alice__carol"))));

console.log("Function-owned collections");
await check("you read your own activity", assertSucceeds(getDoc(doc(a, "verdict_activity/alice/titles/tv_136315"))));
await check("you can't write your activity", assertFails(setDoc(doc(a, "verdict_activity/alice/titles/tv_1"), { ratings: {} })));
await check("nobody reads someone else's activity", assertFails(getDoc(doc(b, "verdict_activity/alice/titles/tv_136315"))));
await check("you read your feed", assertSucceeds(getDocs(collection(a, "verdict_feeds/alice/items"))));
await check("you can't write a feed item", assertFails(setDoc(doc(b, "verdict_feeds/alice/items/y"), { actorUid: "bob" })));
await check("the catch-all rule doesn't cover verdict_", assertFails(setDoc(doc(a, "verdict_anything/x"), { a: 1 })));
await check("titles cache is read-only", assertFails(setDoc(doc(a, "verdict_titles/tv_1"), { details: {} })));
await check("you can file a report", assertSucceeds(setDoc(doc(a, "verdict_reports/r1"), { reporterUid: "alice", targetUid: "bob", reason: "spam" })));
await check("reports aren't readable", assertFails(getDoc(doc(a, "verdict_reports/r1"))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
