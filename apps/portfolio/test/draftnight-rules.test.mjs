import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "josh-cocciardi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
});

const COL = "draftnight_leagues";
const alice = env.authenticatedContext("alice").firestore();
const bob = env.authenticatedContext("bob").firestore();
const anon = env.unauthenticatedContext().firestore();
const league = { ownerUid: "alice", name: "A", preset: "josh", teams: 10, seat: 2, slots: {}, scoring: {}, gone: [], mine: [] };

let pass = 0, fail = 0;
const check = async (label, p) => {
  try { await p; console.log("  PASS", label); pass++; }
  catch (e) { console.log("  FAIL", label, "→", e.message.slice(0, 90)); fail++; }
};

console.log("draftnight_leagues rules:");
await check("alice creates her own league", assertSucceeds(setDoc(doc(alice, COL, "L1"), league)));
await check("alice reads it back", assertSucceeds(getDoc(doc(alice, COL, "L1"))));
await check("alice saves picks", assertSucceeds(updateDoc(doc(alice, COL, "L1"), { mine: ["Bijan Robinson"] })));
await check("alice lists her leagues", assertSucceeds(getDocs(query(collection(alice, COL), where("ownerUid", "==", "alice")))));

await check("bob CANNOT read alice's league", assertFails(getDoc(doc(bob, COL, "L1"))));
await check("bob CANNOT write alice's league", assertFails(updateDoc(doc(bob, COL, "L1"), { mine: ["hacked"] })));
await check("bob CANNOT delete alice's league", assertFails(deleteDoc(doc(bob, COL, "L1"))));
await check("bob CANNOT list alice's leagues", assertFails(getDocs(query(collection(bob, COL), where("ownerUid", "==", "alice")))));
await check("bob CANNOT create a league owned by alice", assertFails(setDoc(doc(bob, COL, "L2"), league)));
await check("alice CANNOT reassign ownership to bob", assertFails(updateDoc(doc(alice, COL, "L1"), { ownerUid: "bob" })));

await check("signed-out CANNOT read", assertFails(getDoc(doc(anon, COL, "L1"))));
await check("signed-out CANNOT create", assertFails(setDoc(doc(anon, COL, "L3"), league)));

await check("alice deletes her own league", assertSucceeds(deleteDoc(doc(alice, COL, "L1"))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
