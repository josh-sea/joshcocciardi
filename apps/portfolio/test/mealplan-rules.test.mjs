// Firestore security-rules tests for the Family Meal Planner. They prove that
// a household's members (by verified email) share recipes, days, and
// inventory; that nobody else can read or write any of it; that an
// unverified account claiming a member's address gets nothing; and that a
// member can't write themselves off the list or take over the household.
//
// Needs the Firestore emulator running against the repo's real rules. See
// test/README.md.

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "josh-cocciardi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
});

const as = (uid, email, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const josh = as("josh", "josh@example.com");
const ash = as("ash", "Ash@Example.com"); // token case differs from the stored list on purpose
const stranger = as("eve", "eve@example.com");
const faker = as("fake", "ash@example.com", false); // email/password signup claiming Ash's address
const anon = env.unauthenticatedContext().firestore();

const COL = "mealplan_households";
const H = "H1";
const hh = { name: "Kitchen", ownerUid: "josh", memberEmails: ["josh@example.com", "ash@example.com"] };

let pass = 0;
let fail = 0;
const check = async (label, p) => {
  try {
    await p;
    console.log("  PASS", label);
    pass++;
  } catch (e) {
    console.log("  FAIL", label, "→", e.message.slice(0, 90));
    fail++;
  }
};

console.log("mealplan_households:");
await check("stranger CANNOT create a household owned by josh", assertFails(setDoc(doc(stranger, COL, "X"), hh)));
await check("josh CANNOT create a household he isn't in", assertFails(setDoc(doc(josh, COL, "X"), { ...hh, memberEmails: ["ash@example.com"] })));
await check("unverified CANNOT create a household", assertFails(setDoc(doc(faker, COL, "X"), { ...hh, ownerUid: "fake" })));
await check("josh creates the household", assertSucceeds(setDoc(doc(josh, COL, H), hh)));
await check("ash reads it", assertSucceeds(getDoc(doc(ash, COL, H))));
await check("ash finds it by email", assertSucceeds(getDocs(query(collection(ash, COL), where("memberEmails", "array-contains", "ash@example.com")))));
await check("stranger CANNOT read it", assertFails(getDoc(doc(stranger, COL, H))));
await check("stranger CANNOT query for ash's household", assertFails(getDocs(query(collection(stranger, COL), where("memberEmails", "array-contains", "ash@example.com")))));
await check("unverified look-alike CANNOT read it", assertFails(getDoc(doc(faker, COL, H))));
await check("signed-out CANNOT read it", assertFails(getDoc(doc(anon, COL, H))));
await check("stranger CANNOT add themselves", assertFails(updateDoc(doc(stranger, COL, H), { memberEmails: [...hh.memberEmails, "eve@example.com"] })));
await check("ash adds a grandparent", assertSucceeds(updateDoc(doc(ash, COL, H), { memberEmails: [...hh.memberEmails, "gram@example.com"] })));
await check("ash CANNOT remove herself", assertFails(updateDoc(doc(ash, COL, H), { memberEmails: ["josh@example.com"] })));
await check("ash CANNOT take ownership", assertFails(updateDoc(doc(ash, COL, H), { ownerUid: "ash" })));
await check("ash CANNOT empty the list", assertFails(updateDoc(doc(ash, COL, H), { memberEmails: [] })));
await check("ash CANNOT delete the household", assertFails(deleteDoc(doc(ash, COL, H))));

const sub = (db, name, id) => doc(db, COL, H, name, id);
const recipe = { name: "Pesto pasta", link: "", ingredients: "basil", made: false, lastMade: null, ratings: {} };
const day = { date: "2026-09-22", dinner: { kind: "recipe", id: "R1", name: "Pesto pasta" } };
const item = { name: "milk" };

for (const [name, id, data] of [
  ["recipes", "R1", recipe],
  ["days", "2026-09-22", day],
  ["inventory", "I1", item],
]) {
  console.log(`\n${name}:`);
  await check(`josh writes ${name}`, assertSucceeds(setDoc(sub(josh, name, id), data)));
  await check(`ash reads ${name}`, assertSucceeds(getDoc(sub(ash, name, id))));
  await check(`ash lists ${name}`, assertSucceeds(getDocs(collection(ash, COL, H, name))));
  await check(`ash updates ${name}`, assertSucceeds(updateDoc(sub(ash, name, id), { touched: true })));
  await check(`stranger CANNOT read ${name}`, assertFails(getDoc(sub(stranger, name, id))));
  await check(`stranger CANNOT list ${name}`, assertFails(getDocs(collection(stranger, COL, H, name))));
  await check(`stranger CANNOT write ${name}`, assertFails(setDoc(sub(stranger, name, "evil"), data)));
  await check(`unverified look-alike CANNOT read ${name}`, assertFails(getDoc(sub(faker, name, id))));
  await check(`signed-out CANNOT read ${name}`, assertFails(getDoc(sub(anon, name, id))));
  await check(`ash deletes from ${name}`, assertSucceeds(deleteDoc(sub(ash, name, id))));
}

console.log("\nweek query:");
await check(
  "ash queries a week of days by date range",
  assertSucceeds(getDocs(query(collection(ash, COL, H, "days"), where("date", ">=", "2026-09-21"), where("date", "<=", "2026-09-27"))))
);

console.log("\nunknown subcollections:");
await check("josh CANNOT write an unlisted subcollection", assertFails(setDoc(sub(josh, "secrets", "x"), { a: 1 })));

console.log("\nremoval:");
await check("josh removes gram", assertSucceeds(updateDoc(doc(josh, COL, H), { memberEmails: hh.memberEmails })));
const gram = as("gram", "gram@example.com");
await check("gram can no longer read the plan", assertFails(getDocs(collection(gram, COL, H, "days"))));
await check("josh deletes the household", assertSucceeds(deleteDoc(doc(josh, COL, H))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
