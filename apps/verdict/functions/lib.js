// Firestore handles and small helpers used by every Verdict function.

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { activityCounts } = require('./shared');

const db = () => getFirestore();

const C = {
  users: 'verdict_users',
  usernames: 'verdict_usernames',
  connections: 'verdict_connections',
  invites: 'verdict_invites',
  ratings: 'verdict_ratings',
  lists: 'verdict_lists',
  activity: 'verdict_activity',
  feeds: 'verdict_feeds',
  titles: 'verdict_titles',
  secrets: 'verdict_secrets',
};

const requireAuth = (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return uid;
};

// Accepted connections of a user, as a list of the other uids.
async function friendUids(uid) {
  const snap = await db()
    .collection(C.connections)
    .where('users', 'array-contains', uid)
    .where('status', '==', 'accepted')
    .get();
  return snap.docs.map((d) => d.data().users.find((u) => u !== uid)).filter(Boolean);
}

async function blockedBy(uid) {
  const snap = await db().doc(`${C.users}/${uid}/private/blocks`).get();
  return (snap.exists && snap.data().blocked) || {};
}

// Read-modify-write one viewer's activity doc for a title. `mutate` gets a
// plain object { ratings, watching, title, ... } and changes it in place.
// The doc is deleted once nobody is left in it.
async function updateActivity(viewerUid, titleKey, mutate) {
  const ref = db().doc(`${C.activity}/${viewerUid}/titles/${titleKey}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : { titleKey, ratings: {}, watching: {} };
    data.ratings = data.ratings || {};
    data.watching = data.watching || {};
    mutate(data);
    if (!Object.keys(data.ratings).length && !Object.keys(data.watching).length) {
      if (snap.exists) tx.delete(ref);
      return;
    }
    tx.set(ref, { ...data, ...activityCounts(data.ratings, data.watching), updatedAt: FieldValue.serverTimestamp() });
  });
}

// Run async jobs with a small concurrency cap.
async function eachLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// Delete every doc a query returns, in batches.
async function deleteQuery(query) {
  for (;;) {
    const snap = await query.limit(300).get();
    if (snap.empty) return;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

const FEED_TTL_DAYS = 90;
const expireAt = () => Timestamp.fromMillis(Date.now() + FEED_TTL_DAYS * 86400000);

module.exports = { db, C, FieldValue, Timestamp, HttpsError, requireAuth, friendUids, blockedBy, updateActivity, eachLimit, deleteQuery, expireAt };
