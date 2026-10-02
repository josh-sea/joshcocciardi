// Firestore security-rules tests for Seasonal Box HQ. They prove that only the
// one allowlisted, verified Google account can read or write any sbox_*
// collection; that the API key can be written but never read back; and that
// even the admin's browser cannot forge what the agent runtime must be honest
// about: spend (ledger, counters), step logs, run progress and cost, or an
// executed result.
//
// Needs the Firestore emulator running against the repo's real rules. See
// test/README.md.

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "josh-cocciardi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
});
await env.clearFirestore();

const as = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const josh = as("josh", "Joshua.Cocciardi@gmail.com"); // case differs from the allowlist on purpose
const stranger = as("eve", "eve@example.com");
const faker = as("fake", "joshua.cocciardi@gmail.com", false); // email/password signup claiming Josh's address
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

// Server-written fixtures, as the Admin SDK would leave them.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "sbox_runs", "R1"), { agentId: "trend-researcher", status: "running", tick: 2, cost: 0.42, claim: { tick: 2, until: 1 } });
  await setDoc(doc(db, "sbox_runs", "R2"), { agentId: "maker-scout", status: "failed", tick: 3, cost: 1.1, error: "boom" });
  await setDoc(doc(db, "sbox_runs", "R3"), { agentId: "analyst", status: "completed", tick: 5, cost: 2 });
  await setDoc(doc(db, "sbox_runs", "R1", "steps", "0000"), { n: 0, cost: 0.2 });
  await setDoc(doc(db, "sbox_ledger", "L1"), { category: "ai", amount: 0.2 });
  await setDoc(doc(db, "sbox_counters", "ai-month-2027-01"), { amount: 0.2 });
  await setDoc(doc(db, "sbox_secrets", "anthropic"), { apiKey: "sk-ant-secret" });
  await setDoc(doc(db, "sbox_proposals", "P1"), { status: "pending", level: "yellow", actionType: "email.send", payloadJson: "{}", execution: null });
  await setDoc(doc(db, "sbox_proposals", "P2"), { status: "approved", level: "yellow", actionType: "email.send", execution: { status: "manual" } });
  await setDoc(doc(db, "sbox_proposals", "P3"), { status: "approved", level: "red", actionType: "brief.approve", execution: { status: "done" } });
});

console.log("who gets in:");
await check("josh reads settings", assertSucceeds(getDoc(doc(josh, "sbox_settings", "global"))));
await check("josh writes settings", assertSucceeds(setDoc(doc(josh, "sbox_settings", "global"), { baseLocation: "Katonah, NY" })));
await check("josh creates a season", assertSucceeds(setDoc(doc(josh, "sbox_seasons", "S1"), { name: "Holiday 2027", stage: 1 })));
await check("josh edits an agent", assertSucceeds(setDoc(doc(josh, "sbox_agents", "analyst"), { name: "Analyst" })));
await check("josh adds a taste note", assertSucceeds(addDoc(collection(josh, "sbox_notes"), { scope: "global", text: "No glitter." })));
await check("josh adds a maker", assertSucceeds(setDoc(doc(josh, "sbox_makers", "m1"), { name: "Hilltop Soap" })));
await check("stranger CANNOT read seasons", assertFails(getDocs(collection(stranger, "sbox_seasons"))));
await check("stranger CANNOT write settings", assertFails(setDoc(doc(stranger, "sbox_settings", "global"), { x: 1 })));
await check("stranger CANNOT read the ledger", assertFails(getDocs(collection(stranger, "sbox_ledger"))));
await check("stranger CANNOT read proposals", assertFails(getDoc(doc(stranger, "sbox_proposals", "P1"))));
await check("unverified account with Josh's address CANNOT read", assertFails(getDoc(doc(faker, "sbox_settings", "global"))));
await check("unverified account CANNOT queue a run", assertFails(setDoc(doc(faker, "sbox_runs", "X"), { agentId: "a", status: "queued", tick: 0, cost: 0 })));
await check("signed out CANNOT read agents", assertFails(getDoc(doc(anon, "sbox_agents", "analyst"))));
await check("the catch-all doesn't let a stranger in", assertFails(setDoc(doc(stranger, "sbox_whatever", "x"), { a: 1 })));

console.log("the API key:");
await check("josh writes the key", assertSucceeds(setDoc(doc(josh, "sbox_secrets", "anthropic"), { apiKey: "sk-ant-new" })));
await check("josh CANNOT read the key back", assertFails(getDoc(doc(josh, "sbox_secrets", "anthropic"))));
await check("stranger CANNOT write the key", assertFails(setDoc(doc(stranger, "sbox_secrets", "anthropic"), { apiKey: "sk-evil" })));

console.log("spend is server-written:");
await check("josh reads the ledger", assertSucceeds(getDocs(collection(josh, "sbox_ledger"))));
await check("josh CANNOT add a ledger entry", assertFails(addDoc(collection(josh, "sbox_ledger"), { category: "ai", amount: -50 })));
await check("josh CANNOT edit a ledger entry", assertFails(updateDoc(doc(josh, "sbox_ledger", "L1"), { amount: 0 })));
await check("josh CANNOT delete a ledger entry", assertFails(deleteDoc(doc(josh, "sbox_ledger", "L1"))));
await check("josh CANNOT reset a spend counter", assertFails(setDoc(doc(josh, "sbox_counters", "ai-month-2027-01"), { amount: 0 })));
await check("josh reads step logs", assertSucceeds(getDocs(collection(josh, "sbox_runs", "R1", "steps"))));
await check("josh CANNOT write a step log", assertFails(setDoc(doc(josh, "sbox_runs", "R1", "steps", "0001"), { n: 1, cost: 0 })));

console.log("runs:");
const queued = { agentId: "trend-researcher", seasonId: "S1", trigger: { type: "manual" }, instructions: "", feedback: null, status: "queued", tick: 0, cost: 0, steps: 0 };
await check("josh queues a run", assertSucceeds(setDoc(doc(josh, "sbox_runs", "N1"), queued)));
await check("josh CANNOT create a run that's already running", assertFails(setDoc(doc(josh, "sbox_runs", "N2"), { ...queued, status: "running" })));
await check("josh CANNOT create a run with a head start on cost", assertFails(setDoc(doc(josh, "sbox_runs", "N3"), { ...queued, cost: -5 })));
await check("josh CANNOT create a run with extra budget", assertFails(setDoc(doc(josh, "sbox_runs", "N4"), { ...queued, budgetExtra: 100 })));
await check("josh cancels a running run", assertSucceeds(updateDoc(doc(josh, "sbox_runs", "R1"), { status: "cancelled" })));
await check("josh resumes a failed run", assertSucceeds(updateDoc(doc(josh, "sbox_runs", "R2"), { status: "queued", error: null })));
await check("josh CANNOT revive a completed run", assertFails(updateDoc(doc(josh, "sbox_runs", "R3"), { status: "queued" })));
await check("josh CANNOT rewrite a run's cost", assertFails(updateDoc(doc(josh, "sbox_runs", "R3"), { cost: 0 })));
await check("josh CANNOT give a run more budget", assertFails(updateDoc(doc(josh, "sbox_runs", "R2"), { budgetExtra: 50 })));
await check("josh CANNOT mark a run completed", assertFails(updateDoc(doc(josh, "sbox_runs", "R2"), { status: "completed" })));
await check("josh CANNOT delete a run", assertFails(deleteDoc(doc(josh, "sbox_runs", "R3"))));

console.log("proposals:");
await check("josh CANNOT create a proposal", assertFails(addDoc(collection(josh, "sbox_proposals"), { status: "approved", actionType: "order.create_po" })));
await check("josh approves a pending proposal", assertSucceeds(updateDoc(doc(josh, "sbox_proposals", "P1"), { status: "approved", decision: { by: "josh" } })));
await check("josh CANNOT flip an approved proposal back", assertFails(updateDoc(doc(josh, "sbox_proposals", "P1"), { status: "pending" })));
await check("josh CANNOT write an execution result", assertFails(updateDoc(doc(josh, "sbox_proposals", "P1"), { execution: { status: "done" } })));
await check("josh CANNOT change what was proposed", assertFails(updateDoc(doc(josh, "sbox_proposals", "P1"), { payloadJson: '{"to":"x"}' })));
await check("josh CANNOT raise the amount on a proposal", assertFails(updateDoc(doc(josh, "sbox_proposals", "P1"), { amountUsd: 999 })));
await check("josh marks a manual action done", assertSucceeds(updateDoc(doc(josh, "sbox_proposals", "P2"), { manual: { done: true, amountUsd: 12 } })));
await check("josh CANNOT mark a non-manual action done", assertFails(updateDoc(doc(josh, "sbox_proposals", "P3"), { manual: { done: true, amountUsd: 0 } })));
await check("josh CANNOT delete a proposal", assertFails(deleteDoc(doc(josh, "sbox_proposals", "P3"))));
await check("stranger CANNOT decide a proposal", assertFails(updateDoc(doc(stranger, "sbox_proposals", "P2"), { status: "rejected" })));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
