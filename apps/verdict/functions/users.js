// Usernames, search, invites, mutual counts and blocking. Friend lists never
// leave the server: the app only ever sees its own connections and counts.

const { onCall } = require('firebase-functions/v2/https');
const { db, C, FieldValue, HttpsError, requireAuth, friendUids, blockedBy } = require('./lib');
const {
  normalizeUsername, usernameProblem, cleanDisplayName, pairId,
  makeInviteCode, normalizeInviteCode, INVITE_RE,
} = require('./shared');

const opts = { region: 'us-central1' };

const publicProfile = (uid, d = {}) => ({
  uid,
  username: d.username || '',
  displayName: d.displayName || d.username || '',
  avatarUrl: d.avatarUrl || null,
});

/* ── Username ─────────────────────────────────────────────────────────── */

// { username, displayName, check }. With check: true it only says whether
// the name is free. Otherwise it claims it, once per account.
exports.verdictClaimUsername = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const name = normalizeUsername(request.data && request.data.username);
  const problem = usernameProblem(name);
  if (problem) return { ok: false, available: false, reason: problem };

  const nameRef = db().doc(`${C.usernames}/${name}`);
  const userRef = db().doc(`${C.users}/${uid}`);

  if (request.data && request.data.check) {
    const snap = await nameRef.get();
    const available = !snap.exists || snap.data().uid === uid;
    return { ok: available, available, reason: available ? null : 'That username is taken.' };
  }

  const displayName = cleanDisplayName(request.data && request.data.displayName) || name;
  return db().runTransaction(async (tx) => {
    const [nameSnap, userSnap] = await Promise.all([tx.get(nameRef), tx.get(userRef)]);
    const current = userSnap.exists ? userSnap.data().username : null;
    if (current && current !== name) {
      throw new HttpsError('failed-precondition', "Usernames can't be changed once they're set.");
    }
    if (nameSnap.exists && nameSnap.data().uid !== uid) {
      return { ok: false, available: false, reason: 'That username is taken.' };
    }
    tx.set(nameRef, { uid, createdAt: FieldValue.serverTimestamp() });
    tx.set(userRef, { username: name, displayName, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, username: name, displayName };
  });
});

/* ── Search ───────────────────────────────────────────────────────────── */

async function connectionState(me, other) {
  const snap = await db().doc(`${C.connections}/${pairId(me, other)}`).get();
  if (!snap.exists) return 'none';
  const c = snap.data();
  if (c.status === 'accepted') return 'friends';
  return c.requestedBy === me ? 'pending_out' : 'pending_in';
}

// Prefix search over discoverable usernames. Private accounts never appear.
exports.verdictSearchUsers = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const q = normalizeUsername(request.data && request.data.query).replace(/[^a-z0-9_.]/g, '');
  if (q.length < 2) return { results: [] };

  const snap = await db()
    .collection(C.users)
    .where('discoverable', '==', true)
    .where('username', '>=', q)
    .where('username', '<', `${q}`)
    .orderBy('username')
    .limit(25)
    .get();

  const mine = await blockedBy(uid);
  const candidates = snap.docs.filter((d) => d.id !== uid && !mine[d.id]);
  const results = [];
  for (const d of candidates) {
    const theirs = await blockedBy(d.id);
    if (theirs[uid]) continue;
    results.push({ ...publicProfile(d.id, d.data()), connection: await connectionState(uid, d.id) });
    if (results.length >= 20) break;
  }
  return { results };
});

// One profile by uid, with the connection state. Used by Friend Profile.
exports.verdictGetProfile = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const other = String((request.data && request.data.uid) || '');
  if (!other) throw new HttpsError('invalid-argument', 'Who?');
  const [snap, mine, theirs] = await Promise.all([db().doc(`${C.users}/${other}`).get(), blockedBy(uid), blockedBy(other)]);
  if (!snap.exists || theirs[uid]) throw new HttpsError('not-found', 'That account is not available.');
  return { profile: publicProfile(other, snap.data()), connection: await connectionState(uid, other), blocked: Boolean(mine[other]) };
});

/* ── Invites ──────────────────────────────────────────────────────────── */

// { regenerate }. Returns the caller's invite code, making one if needed.
exports.verdictInviteCode = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const privRef = db().doc(`${C.users}/${uid}/private/invite`);
  const priv = await privRef.get();
  const old = priv.exists ? priv.data().code : null;
  if (old && !(request.data && request.data.regenerate)) return { code: old };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeInviteCode();
    const ref = db().doc(`${C.invites}/${code}`);
    const created = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists) return false;
      tx.set(ref, { uid, createdAt: FieldValue.serverTimestamp() });
      tx.set(privRef, { code });
      if (old) tx.delete(db().doc(`${C.invites}/${old}`));
      return true;
    });
    if (created) return { code };
  }
  throw new HttpsError('internal', 'Could not make an invite code. Try again.');
});

// { code }. Sends a friend request to whoever owns the code. If they had
// already asked the caller, this accepts it instead.
exports.verdictRedeemInvite = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const code = normalizeInviteCode(request.data && request.data.code);
  if (!INVITE_RE.test(code)) throw new HttpsError('invalid-argument', 'That code does not look right.');

  const inv = await db().doc(`${C.invites}/${code}`).get();
  if (!inv.exists) throw new HttpsError('not-found', 'That invite code does not work anymore.');
  const owner = inv.data().uid;
  if (owner === uid) throw new HttpsError('failed-precondition', "That's your own invite code.");

  const [ownerSnap, theirs, mine] = await Promise.all([db().doc(`${C.users}/${owner}`).get(), blockedBy(owner), blockedBy(uid)]);
  if (!ownerSnap.exists || theirs[uid] || mine[owner]) throw new HttpsError('not-found', 'That invite code does not work anymore.');

  const users = [uid, owner].sort();
  const ref = db().doc(`${C.connections}/${pairId(uid, owner)}`);
  const state = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) {
      tx.set(ref, { users, requestedBy: uid, status: 'pending', via: 'invite', createdAt: FieldValue.serverTimestamp() });
      return 'pending_out';
    }
    const c = s.data();
    if (c.status === 'accepted') return 'friends';
    if (c.requestedBy === uid) return 'pending_out';
    tx.update(ref, { status: 'accepted', respondedAt: FieldValue.serverTimestamp() });
    return 'friends';
  });
  return { profile: publicProfile(owner, ownerSnap.data()), connection: state };
});

/* ── Mutual friends ───────────────────────────────────────────────────── */

exports.verdictMutualCount = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const other = String((request.data && request.data.uid) || '');
  if (!other || other === uid) return { count: 0 };
  const conn = await db().doc(`${C.connections}/${pairId(uid, other)}`).get();
  if (!conn.exists) throw new HttpsError('permission-denied', 'Only for friends and friend requests.');
  const [a, b] = await Promise.all([friendUids(uid), friendUids(other)]);
  const set = new Set(a);
  return { count: b.filter((x) => x !== uid && set.has(x)).length };
});

/* ── Blocking ─────────────────────────────────────────────────────────── */

exports.verdictBlock = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const other = String((request.data && request.data.uid) || '');
  if (!other || other === uid) throw new HttpsError('invalid-argument', 'Who?');
  await db().doc(`${C.users}/${uid}/private/blocks`).set({ blocked: { [other]: true } }, { merge: true });
  // Deleting the connection triggers the cleanup in fanout.js.
  await db().doc(`${C.connections}/${pairId(uid, other)}`).delete();
  return { ok: true };
});

exports.verdictUnblock = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const other = String((request.data && request.data.uid) || '');
  if (!other) throw new HttpsError('invalid-argument', 'Who?');
  await db().doc(`${C.users}/${uid}/private/blocks`).set({ blocked: { [other]: FieldValue.delete() } }, { merge: true });
  return { ok: true };
});

// Names for the blocked list in Settings.
exports.verdictBlockedList = onCall(opts, async (request) => {
  const uid = requireAuth(request);
  const ids = Object.keys(await blockedBy(uid));
  if (!ids.length) return { results: [] };
  const snaps = await db().getAll(...ids.map((id) => db().doc(`${C.users}/${id}`)));
  return { results: snaps.map((s) => publicProfile(s.id, s.exists ? s.data() : { displayName: 'Deleted account' })) };
});
