// verdictDeleteAccount: removes every Verdict record of the caller. Safe to
// call again if it fails part way.

const { onCall } = require('firebase-functions/v2/https');
const { db, C, requireAuth, friendUids, deleteQuery, eachLimit } = require('./lib');
const { _internal: { scrub } } = require('./fanout');

exports.verdictDeleteAccount = onCall({ region: 'us-central1', timeoutSeconds: 300 }, async (request) => {
  const uid = requireAuth(request);

  // 1. Take this user out of every friend's index and feed.
  const friends = await friendUids(uid);
  await eachLimit(friends, 5, (f) => scrub(uid, f));

  // 2. Connections (any status). Deleting them first means the rating and
  //    list deletes below find no friends to fan out to.
  await deleteQuery(db().collection(C.connections).where('users', 'array-contains', uid));

  // 3. Their own data.
  await deleteQuery(db().collection(C.ratings).where('uid', '==', uid));
  await deleteQuery(db().collection(C.lists).where('uid', '==', uid));
  await deleteQuery(db().collection(C.invites).where('uid', '==', uid));

  const userRef = db().doc(`${C.users}/${uid}`);
  const userSnap = await userRef.get();
  const username = userSnap.exists ? userSnap.data().username : null;
  if (username) {
    const nameRef = db().doc(`${C.usernames}/${username}`);
    const nameSnap = await nameRef.get();
    if (nameSnap.exists && nameSnap.data().uid === uid) await nameRef.delete();
  }

  await db().recursiveDelete(db().doc(`${C.activity}/${uid}`));
  await db().recursiveDelete(db().doc(`${C.feeds}/${uid}`));
  await db().recursiveDelete(userRef);

  // The Firebase Auth user is NOT deleted. This project's Auth pool is
  // shared with the other apps on joshcocciardi.com, so deleting it here
  // would also delete the same person's sign-in for those. Every Verdict
  // record is gone; signing in again starts a fresh Verdict account.
  return { ok: true };
});
