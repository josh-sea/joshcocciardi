import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, Timestamp,
} from "firebase/firestore";
import fs from "fs";

// contact_messages: the public /contact form writes here, only Josh reads.
const env = await initializeTestEnvironment({
  projectId: "josh-cocciardi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
});

const COL = "contact_messages";
const anon = env.unauthenticatedContext().firestore();
const stranger = env.authenticatedContext("bob", { email: "bob@example.com", email_verified: true }).firestore();
const josh = env.authenticatedContext("josh", { email: "joshua.cocciardi@gmail.com", email_verified: true }).firestore();
const fakeJosh = env.authenticatedContext("mallory", { email: "joshua.cocciardi@gmail.com", email_verified: false }).firestore();

const msg = (o = {}) => ({ name: "Ada", email: "ada@example.com", message: "Hello!", createdAt: serverTimestamp(), read: false, ...o });

let pass = 0, fail = 0;
const check = async (label, p) => {
  try { await p; console.log("  PASS", label); pass++; }
  catch (e) { console.log("  FAIL", label, "→", e.message.slice(0, 90)); fail++; }
};

console.log("contact_messages rules:");
await check("signed-out visitor can send a message", assertSucceeds(setDoc(doc(anon, COL, "m1"), msg())));
await check("signed-in stranger can send one too", assertSucceeds(addDoc(collection(stranger, COL), msg())));
await check("CANNOT add extra fields", assertFails(addDoc(collection(anon, COL), msg({ admin: true }))));
await check("CANNOT omit a field", assertFails(addDoc(collection(anon, COL), { name: "A", email: "a@b.co", message: "x", createdAt: serverTimestamp() })));
await check("CANNOT pre-mark as read", assertFails(addDoc(collection(anon, COL), msg({ read: true }))));
await check("CANNOT backdate createdAt", assertFails(addDoc(collection(anon, COL), msg({ createdAt: Timestamp.fromMillis(0) }))));
await check("CANNOT send an empty message", assertFails(addDoc(collection(anon, COL), msg({ message: "" }))));
await check("CANNOT send a 5001-char message", assertFails(addDoc(collection(anon, COL), msg({ message: "x".repeat(5001) }))));
await check("CANNOT use a malformed email", assertFails(addDoc(collection(anon, COL), msg({ email: "not an email" }))));
await check("CANNOT use a non-string name", assertFails(addDoc(collection(anon, COL), msg({ name: 42 }))));

await check("visitor CANNOT read a message", assertFails(getDoc(doc(anon, COL, "m1"))));
await check("stranger CANNOT read a message", assertFails(getDoc(doc(stranger, COL, "m1"))));
await check("stranger CANNOT list messages", assertFails(getDocs(collection(stranger, COL))));
await check("visitor CANNOT overwrite a message", assertFails(setDoc(doc(anon, COL, "m1"), msg({ message: "edited" }))));
await check("stranger CANNOT delete a message", assertFails(deleteDoc(doc(stranger, COL, "m1"))));
await check("unverified account using Josh's address CANNOT read", assertFails(getDocs(collection(fakeJosh, COL))));

await check("Josh lists messages", assertSucceeds(getDocs(collection(josh, COL))));
await check("Josh marks one read", assertSucceeds(updateDoc(doc(josh, COL, "m1"), { read: true })));
await check("Josh CANNOT rewrite the message body", assertFails(updateDoc(doc(josh, COL, "m1"), { message: "edited" })));
await check("Josh CANNOT set read to a non-bool", assertFails(updateDoc(doc(josh, COL, "m1"), { read: "yes" })));
await check("Josh deletes one", assertSucceeds(deleteDoc(doc(josh, COL, "m1"))));

// The catch-all at the bottom of firestore.rules lets any signed-in user
// write unknown collections; contact_messages must be carved out of it.
await check("catch-all does not reopen it to signed-in users", assertFails(getDocs(collection(stranger, COL))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
