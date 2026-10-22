// Exercises the readingBuddyFile function (functions/readingbuddy.js) against
// the emulator suite: its auth gate (token, verified email), shelf
// membership, the path allowlist, and that a member gets the file's bytes
// and type back. Tokens are minted by the Auth emulator, the shelf is
// written to the Firestore emulator and the files to the Storage emulator,
// all with the emulators' admin bypass so the rules aren't in the way of
// setup. See test/README.md for how to start the emulators (the function
// has to see the same default bucket the app uploads to).

const PROJECT = "josh-cocciardi";
const BUCKET = "josh-cocciardi.firebasestorage.app";
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1/readingBuddyFile`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST = `http://127.0.0.1:9199/v0/b/${BUCKET}/o`;
const KEY = "fake-api-key";
const OWNER = { Authorization: "Bearer owner" };

const google = async (email) => {
  const r = await fetch(`${AUTH}/accounts:signInWithIdp?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestUri: "http://localhost",
      returnSecureToken: true,
      postBody: `providerId=google.com&id_token=${encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true }))}`,
    }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("no token: " + JSON.stringify(j));
  return j.idToken;
};

// An email-and-password account that never clicked its verification link.
const unverified = async (email) => {
  const r = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
  });
  return (await r.json()).idToken;
};

// Uploaded the way the app's Storage SDK does it (multipart: JSON metadata,
// then the bytes), so the stored content type is what the app would store.
const put = async (path, bytes, contentType) => {
  const boundary = `rb${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ name: path, contentType })}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  const r = await fetch(`${ST}?name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { ...OWNER, "X-Goog-Upload-Protocol": "multipart", "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${await r.text()}`);
};

const get = (path, token, init = {}) =>
  fetch(`${FN}?path=${encodeURIComponent(path)}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });

let pass = 0;
let fail = 0;
const t = (label, cond, detail) => {
  if (cond) {
    console.log("  PASS", label);
    pass++;
  } else {
    console.log("  FAIL", label, "→", JSON.stringify(detail).slice(0, 220));
    fail++;
  }
};
const body = async (r) => {
  try {
    return await r.json();
  } catch (e) {
    return null;
  }
};

const run = Date.now().toString(36);
const SID = `shelf${run}`;
const BID = `book${run}`;
const IMG = `readingbuddy/${SID}/${BID}/p1.jpg`;
const AUD = `readingbuddy/${SID}/${BID}/p1-1.m4a`;
const TXT = `readingbuddy/${SID}/${BID}/notes.txt`;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const m4a = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 9, 8, 7]);

// Shelf: josh and ash (stored lowercase, as the app stores it).
const shelf = await fetch(`${FS}/readingbuddy_shelves?documentId=${SID}`, {
  method: "POST",
  headers: { ...OWNER, "Content-Type": "application/json" },
  body: JSON.stringify({
    fields: {
      name: { stringValue: "Bedtime" },
      ownerUid: { stringValue: "josh" },
      memberEmails: { arrayValue: { values: [{ stringValue: "josh@example.com" }, { stringValue: "ash@example.com" }] } },
    },
  }),
});
if (!shelf.ok) throw new Error("seed shelf: " + (await shelf.text()));
await put(IMG, jpeg, "image/jpeg");
await put(AUD, m4a, "audio/mp4");
await put(TXT, new TextEncoder().encode("hi"), "text/plain");

const josh = await google("josh@example.com");
const ash = await google("Ash@Example.com"); // case differs from the stored list on purpose
const eve = await google("eve@example.com");
const faker = await unverified(`ash${run}@example.com`);

console.log("readingBuddyFile:");
let r = await get(IMG, null);
t("no token: 401", r.status === 401, await body(r));
r = await get(IMG, "not-a-token");
t("garbage token: 401", r.status === 401, await body(r));
r = await get(IMG, faker);
t("unverified email account: 403", r.status === 403, await body(r));
r = await get(IMG, eve);
t("verified stranger: 403", r.status === 403, await body(r));
r = await get(`readingbuddy/nope${run}/${BID}/p1.jpg`, josh);
t("a shelf that doesn't exist reads the same as not yours: 403", r.status === 403, await body(r));

r = await get(IMG, josh);
const got = new Uint8Array(await r.arrayBuffer());
t("member gets the photo", r.status === 200 && r.headers.get("content-type") === "image/jpeg", r.status);
t("byte for byte", got.length === jpeg.length && got.every((b, i) => b === jpeg[i]), Array.from(got));
t("kept out of shared caches", /private/.test(r.headers.get("cache-control") || ""), r.headers.get("cache-control"));
r = await get(AUD, ash);
t("member by email in any case gets the recording", r.status === 200 && r.headers.get("content-type") === "audio/mp4", r.status);
await r.arrayBuffer();

for (const [label, path] of [
  ["parent folder", `readingbuddy/${SID}/../../secret.jpg`],
  ["another app's folder", `collector/${SID}/${BID}/p1.jpg`],
  ["extra segment", `readingbuddy/${SID}/${BID}/x/p1.jpg`],
  ["no file", `readingbuddy/${SID}/${BID}/`],
  ["absolute", `/readingbuddy/${SID}/${BID}/p1.jpg`],
  ["encoded slash", `readingbuddy/${SID}/${BID}/a%2Fb.jpg`],
]) {
  r = await get(path, josh);
  t(`bad path (${label}): 400`, r.status === 400, await body(r));
}
r = await fetch(FN, { headers: { Authorization: `Bearer ${josh}` } });
t("no path at all: 400", r.status === 400, await body(r));

r = await get(`readingbuddy/${SID}/${BID}/gone.jpg`, josh);
t("missing file: 404", r.status === 404, await body(r));
r = await get(TXT, josh);
t("not a photo or recording: 415", r.status === 415, await body(r));
r = await get(IMG, josh, { method: "POST" });
t("POST: 405", r.status === 405, await body(r));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
