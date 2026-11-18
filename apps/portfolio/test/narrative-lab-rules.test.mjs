// Firestore security-rules tests for Narrative Lab. They prove that only the
// one allowlisted, verified Google account can read or write any nl_*
// collection (the catch-all rule must not let other signed-in users in); that
// the API key can be written but never read back; that an item can only be
// submitted as a fresh capture and only retried from failed or stalled; and
// that even the admin's browser cannot forge what the pipeline must be honest
// about: the original capture, findings, scores, edges, spend, or the log.
//
// Needs the Firestore emulator running against the repo's real rules. See
// test/README.md.

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "josh-cocciardi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
});
await env.clearFirestore();

const as = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const josh = as("josh", "Joshua.Cocciardi@gmail.com"); // case differs from the allowlist on purpose
const stranger = as("eve", "eve@example.com");
const faker = as("fake", "joshua.cocciardi@gmail.com", false);
const anon = env.unauthenticatedContext().firestore();

let pass = 0;
let fail = 0;
const check = async (label, p) => {
  try {
    await p;
    console.log("  PASS", label);
    pass++;
  } catch (e) {
    console.log("  FAIL", label, "→", String(e.message).slice(0, 100));
    fail++;
  }
};

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "nl_items", "done1"), { status: "done", stage: "done", input: { url: "https://x" }, scores: { densityRaw: 4 }, findings: [] });
  await setDoc(doc(db, "nl_items", "failed1"), { status: "failed", stage: "blind", input: {}, error: "boom" });
  await setDoc(doc(db, "nl_raw", "done1"), { text: "original" });
  await setDoc(doc(db, "nl_edges", "e1"), { from: "a", to: "done1", status: "done", fidelity: 40 });
  await setDoc(doc(db, "nl_sources", "person-x"), { name: "X", kind: "individual", notes: "", affiliations: [], profile: { items: 3 }, itemsCount: 3 });
  await setDoc(doc(db, "nl_narratives", "n1"), { name: "Story", summary: "s", itemCount: 2 });
  await setDoc(doc(db, "nl_claims", "c1"), { text: "claim", itemIds: ["done1"], verdict: "unreviewed" });
  await setDoc(doc(db, "nl_secrets", "anthropic"), { apiKey: "sk-ant-secret" });
  await setDoc(doc(db, "nl_counters", "month-2026-11"), { usd: 1.2 });
  await setDoc(doc(db, "nl_log", "l1"), { event: "scored" });
  await setDoc(doc(db, "nl_shares", "existingtoken_aaaaaaaaaaaa"), { scope: "cascade", targetId: "done1", label: "L", allowSuggestions: true, revoked: false, views: 7, suggestions: 2 });
  await setDoc(doc(db, "nl_suggestions", "s1"), { token: "existingtoken_aaaaaaaaaaaa", url: "https://x.com/a", status: "pending", itemId: null });
});

const fresh = (input = { url: "https://example.com/a" }) => ({ status: "queued", stage: "capture", input, createdAt: serverTimestamp() });

console.log("who gets in:");
await check("josh reads items", assertSucceeds(getDoc(doc(josh, "nl_items", "done1"))));
await check("josh lists items", assertSucceeds(getDocs(collection(josh, "nl_items"))));
await check("josh reads a capture", assertSucceeds(getDoc(doc(josh, "nl_raw", "done1"))));
await check("josh reads edges, sources, narratives, claims, spend, log", Promise.all([
  getDoc(doc(josh, "nl_edges", "e1")), getDoc(doc(josh, "nl_sources", "person-x")), getDoc(doc(josh, "nl_narratives", "n1")),
  getDoc(doc(josh, "nl_claims", "c1")), getDoc(doc(josh, "nl_counters", "month-2026-11")), getDoc(doc(josh, "nl_log", "l1")),
].map(assertSucceeds)));
await check("josh writes settings", assertSucceeds(setDoc(doc(josh, "nl_settings", "global"), { model: "claude-opus-5-5" })));
for (const [name, db] of [["a stranger", stranger], ["an unverified josh", faker], ["signed out", anon]]) {
  await check(`${name} cannot read items`, assertFails(getDoc(doc(db, "nl_items", "done1"))));
  await check(`${name} cannot list items`, assertFails(getDocs(collection(db, "nl_items"))));
  await check(`${name} cannot read a capture`, assertFails(getDoc(doc(db, "nl_raw", "done1"))));
  await check(`${name} cannot read sources`, assertFails(getDoc(doc(db, "nl_sources", "person-x"))));
  await check(`${name} cannot submit an item`, assertFails(setDoc(doc(db, "nl_items", `x-${name}`), fresh())));
  await check(`${name} cannot write settings`, assertFails(setDoc(doc(db, "nl_settings", "global"), { budgetMonthlyUsd: 9999 })));
  await check(`${name} cannot write a key`, assertFails(setDoc(doc(db, "nl_secrets", "anthropic"), { apiKey: "sk-evil" })));
}
await check("the catch-all does not open an unlisted nl_ collection", assertFails(setDoc(doc(stranger, "nl_whatever", "x"), { a: 1 })));

console.log("the key:");
await check("josh saves a key", assertSucceeds(setDoc(doc(josh, "nl_secrets", "anthropic"), { apiKey: "sk-ant-new" })));
await check("josh cannot read it back", assertFails(getDoc(doc(josh, "nl_secrets", "anthropic"))));

console.log("submitting:");
await check("josh submits a link", assertSucceeds(setDoc(doc(josh, "nl_items", "new1"), fresh())));
await check("josh submits pasted text with links upstream", assertSucceeds(addDoc(collection(josh, "nl_items"), fresh({ text: "words", upstreamIds: ["done1"] }))));
await check("cannot submit past capture", assertFails(setDoc(doc(josh, "nl_items", "new2"), { ...fresh(), stage: "writeback" })));
await check("cannot submit as done", assertFails(setDoc(doc(josh, "nl_items", "new3"), { ...fresh(), status: "done" })));
await check("cannot submit with scores", assertFails(setDoc(doc(josh, "nl_items", "new4"), { ...fresh(), scores: { densityRaw: 0 } })));
await check("cannot submit with findings", assertFails(setDoc(doc(josh, "nl_items", "new5"), { ...fresh(), findings: [] })));
await check("input must be a map", assertFails(setDoc(doc(josh, "nl_items", "new6"), { ...fresh(), input: "https://x" })));

console.log("after submitting:");
await check("josh retries a failed item", assertSucceeds(updateDoc(doc(josh, "nl_items", "failed1"), { status: "queued", retryRequestedAt: serverTimestamp() })));
await check("josh archives and annotates", assertSucceeds(updateDoc(doc(josh, "nl_items", "done1"), { archived: true, notes: "check the second claim" })));
await check("cannot requeue a done item from the browser", assertFails(updateDoc(doc(josh, "nl_items", "done1"), { status: "queued" })));
await check("cannot move an item's stage", assertFails(updateDoc(doc(josh, "nl_items", "done1"), { stage: "capture" })));
await check("cannot edit scores", assertFails(updateDoc(doc(josh, "nl_items", "done1"), { "scores.densityRaw": 0 })));
await check("cannot edit findings", assertFails(updateDoc(doc(josh, "nl_items", "done1"), { findings: [{ id: "f1" }] })));
await check("cannot mark an item done", assertFails(updateDoc(doc(josh, "nl_items", "new1"), { status: "done" })));
await check("cannot delete an item from the browser", assertFails(deleteDoc(doc(josh, "nl_items", "done1"))));

console.log("server-written records:");
await check("capture is immutable", assertFails(updateDoc(doc(josh, "nl_raw", "done1"), { text: "edited" })));
await check("cannot forge a capture", assertFails(setDoc(doc(josh, "nl_raw", "forged"), { text: "x" })));
await check("cannot edit an edge's fidelity", assertFails(updateDoc(doc(josh, "nl_edges", "e1"), { fidelity: 100 })));
await check("cannot create an edge", assertFails(setDoc(doc(josh, "nl_edges", "e2"), { from: "a", to: "b" })));
await check("cannot touch spend", assertFails(setDoc(doc(josh, "nl_counters", "month-2026-11"), { usd: 0 })));
await check("cannot write the log", assertFails(addDoc(collection(josh, "nl_log"), { event: "forged" })));

console.log("Josh's judgment:");
await check("edit a source's notes and affiliations", assertSucceeds(updateDoc(doc(josh, "nl_sources", "person-x"), { notes: "Sponsored by Y", affiliations: [{ name: "Y", cite: "https://y" }] })));
await check("cannot edit a source's profile", assertFails(updateDoc(doc(josh, "nl_sources", "person-x"), { profile: { items: 99 } })));
await check("cannot create a source", assertFails(setDoc(doc(josh, "nl_sources", "person-new"), { name: "New" })));
await check("rename a narrative", assertSucceeds(updateDoc(doc(josh, "nl_narratives", "n1"), { name: "Clearer name", notes: "merge candidate" })));
await check("cannot edit a narrative's count", assertFails(updateDoc(doc(josh, "nl_narratives", "n1"), { itemCount: 50 })));
await check("set a claim's verdict", assertSucceeds(updateDoc(doc(josh, "nl_claims", "c1"), { verdict: "false", verdictNote: "Retracted 11/14" })));
await check("cannot relink a claim", assertFails(updateDoc(doc(josh, "nl_claims", "c1"), { itemIds: [] })));

console.log("share links:");
const newShare = (extra = {}) => ({ scope: "cascade", targetId: "done1", label: "Memo", allowSuggestions: true, expiresAt: null, revoked: false, views: 0, suggestions: 0, createdAt: serverTimestamp(), ...extra });
const tok = "freshtoken_bbbbbbbbbbbbbbbb";
await check("josh creates a share", assertSucceeds(setDoc(doc(josh, "nl_shares", tok), newShare())));
await check("josh reads shares", assertSucceeds(getDoc(doc(josh, "nl_shares", tok))));
await check("a short token is refused", assertFails(setDoc(doc(josh, "nl_shares", "short"), newShare())));
await check("cannot create with views already counted", assertFails(setDoc(doc(josh, "nl_shares", "tok_cccccccccccccccccccccc"), newShare({ views: 50 }))));
await check("cannot create already revoked", assertFails(setDoc(doc(josh, "nl_shares", "tok_dddddddddddddddddddddd"), newShare({ revoked: true }))));
await check("cannot create with an unknown scope", assertFails(setDoc(doc(josh, "nl_shares", "tok_eeeeeeeeeeeeeeeeeeeeee"), newShare({ scope: "everything" }))));
await check("cannot create with extra fields", assertFails(setDoc(doc(josh, "nl_shares", "tok_ffffffffffffffffffffff"), newShare({ hourCount: -100 }))));
await check("josh turns a share off", assertSucceeds(updateDoc(doc(josh, "nl_shares", "existingtoken_aaaaaaaaaaaa"), { revoked: true, revokedAt: serverTimestamp() })));
await check("josh turns suggestions off", assertSucceeds(updateDoc(doc(josh, "nl_shares", "existingtoken_aaaaaaaaaaaa"), { allowSuggestions: false })));
await check("cannot reset a view count", assertFails(updateDoc(doc(josh, "nl_shares", "existingtoken_aaaaaaaaaaaa"), { views: 0 })));
await check("cannot repoint a share", assertFails(updateDoc(doc(josh, "nl_shares", "existingtoken_aaaaaaaaaaaa"), { targetId: "other" })));
await check("josh deletes a share", assertSucceeds(deleteDoc(doc(josh, "nl_shares", tok))));
for (const [name, db] of [["a stranger", stranger], ["signed out", anon]]) {
  await check(`${name} cannot read a share by its token`, assertFails(getDoc(doc(db, "nl_shares", "existingtoken_aaaaaaaaaaaa"))));
  await check(`${name} cannot list shares`, assertFails(getDocs(collection(db, "nl_shares"))));
  await check(`${name} cannot create a share`, assertFails(setDoc(doc(db, "nl_shares", "tok_gggggggggggggggggggggg"), newShare())));
  await check(`${name} cannot write a suggestion directly`, assertFails(setDoc(doc(db, "nl_suggestions", "s9"), { url: "https://x", status: "pending" })));
  await check(`${name} cannot read suggestions`, assertFails(getDoc(doc(db, "nl_suggestions", "s1"))));
}

console.log("suggestions:");
await check("josh reads suggestions", assertSucceeds(getDoc(doc(josh, "nl_suggestions", "s1"))));
await check("josh accepts one", assertSucceeds(updateDoc(doc(josh, "nl_suggestions", "s1"), { status: "accepted", itemId: "new1", decidedAt: serverTimestamp() })));
await check("cannot rewrite what a viewer sent", assertFails(updateDoc(doc(josh, "nl_suggestions", "s1"), { url: "https://other" })));
await check("cannot invent a status", assertFails(updateDoc(doc(josh, "nl_suggestions", "s1"), { status: "published" })));
await check("josh cannot forge a suggestion either", assertFails(setDoc(doc(josh, "nl_suggestions", "s2"), { url: "https://x", status: "pending" })));
await check("an accepted suggestion becomes a normal item", assertSucceeds(setDoc(doc(josh, "nl_items", "fromsugg"), fresh({ url: "https://x.com/a", suggestionId: "s1" }))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
