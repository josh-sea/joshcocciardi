// Firestore security-rules tests for My Reading Buddy. They prove that a
// bookshelf's members (by verified email) share its books; that strangers,
// signed-out clients, and an unverified account claiming a member's address
// get nothing; and that a member can't write themselves off the list or
// take over the shelf.
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

const COL = "readingbuddy_shelves";
const S = "S1";
const shelf = { name: "Bedtime", ownerUid: "josh", memberEmails: ["josh@example.com", "ash@example.com"] };
const book = (db, id = "B1") => doc(db, COL, S, "books", id);
const page = { id: "p1", image: { url: "u", path: "readingbuddy/S1/B1/p1.jpg", w: 2400, h: 1600 }, audio: null };

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

console.log("readingbuddy_shelves:");
await check("stranger CANNOT create a shelf owned by josh", assertFails(setDoc(doc(stranger, COL, "X"), shelf)));
await check("josh CANNOT create a shelf he isn't on", assertFails(setDoc(doc(josh, COL, "X"), { ...shelf, memberEmails: ["ash@example.com"] })));
await check("unverified CANNOT create a shelf", assertFails(setDoc(doc(faker, COL, "X"), { ...shelf, ownerUid: "fake" })));
await check("josh creates the shelf", assertSucceeds(setDoc(doc(josh, COL, S), shelf)));
await check("ash reads it", assertSucceeds(getDoc(doc(ash, COL, S))));
await check("ash finds it by email", assertSucceeds(getDocs(query(collection(ash, COL), where("memberEmails", "array-contains", "ash@example.com")))));
await check("stranger CANNOT read it", assertFails(getDoc(doc(stranger, COL, S))));
await check("unverified CANNOT read it", assertFails(getDoc(doc(faker, COL, S))));
await check("signed out CANNOT read it", assertFails(getDoc(doc(anon, COL, S))));
await check("a missing shelf reads as not found, not denied", assertSucceeds(getDoc(doc(stranger, COL, "nope"))));

console.log("\nmembership:");
await check("ash adds gram", assertSucceeds(updateDoc(doc(ash, COL, S), { memberEmails: [...shelf.memberEmails, "gram@example.com"] })));
await check("ash CANNOT remove herself", assertFails(updateDoc(doc(ash, COL, S), { memberEmails: ["josh@example.com", "gram@example.com"] })));
await check("ash CANNOT take ownership", assertFails(updateDoc(doc(ash, COL, S), { ownerUid: "ash" })));
await check("ash CANNOT empty the list", assertFails(updateDoc(doc(ash, COL, S), { memberEmails: [] })));
await check("stranger CANNOT add themselves", assertFails(updateDoc(doc(stranger, COL, S), { memberEmails: [...shelf.memberEmails, "eve@example.com"] })));
await check("ash renames the shelf", assertSucceeds(updateDoc(doc(ash, COL, S), { name: "Stories" })));
await check("ash CANNOT delete josh's shelf", assertFails(deleteDoc(doc(ash, COL, S))));

console.log("\nbooks:");
await check("ash adds a book", assertSucceeds(setDoc(book(ash), { title: "Goodnight Moon", readBy: "Mom", pages: [page], createdBy: "ash" })));
await check("josh reads it", assertSucceeds(getDoc(book(josh))));
await check("josh lists the shelf's books", assertSucceeds(getDocs(collection(josh, COL, S, "books"))));
await check("josh records a page", assertSucceeds(updateDoc(book(josh), { pages: [{ ...page, audio: { url: "a", path: "p", type: "audio/mp4", secs: 12 } }] })));
await check("gram (added by email) reads it", assertSucceeds(getDoc(book(as("gram", "gram@example.com")))));
await check("stranger CANNOT read it", assertFails(getDoc(book(stranger))));
await check("stranger CANNOT list the books", assertFails(getDocs(collection(stranger, COL, S, "books"))));
await check("stranger CANNOT add a book", assertFails(setDoc(book(stranger, "B2"), { title: "x", pages: [] })));
await check("unverified CANNOT read it", assertFails(getDoc(book(faker))));
await check("signed out CANNOT read it", assertFails(getDoc(book(anon))));
await check("books under a shelf that doesn't exist are denied", assertFails(setDoc(doc(josh, COL, "ghost", "books", "B"), { title: "x" })));

console.log("\nunknown subcollections:");
await check("josh CANNOT write an unlisted subcollection", assertFails(setDoc(doc(josh, COL, S, "secrets", "x"), { a: 1 })));

console.log("\nremoval:");
await check("josh removes gram", assertSucceeds(updateDoc(doc(josh, COL, S), { memberEmails: shelf.memberEmails })));
await check("gram can no longer read the books", assertFails(getDocs(collection(as("gram", "gram@example.com"), COL, S, "books"))));
await check("ash deletes the book", assertSucceeds(deleteDoc(book(ash))));
await check("josh deletes the shelf", assertSucceeds(deleteDoc(doc(josh, COL, S))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
