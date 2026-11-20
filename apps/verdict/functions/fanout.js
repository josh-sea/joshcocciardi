// Fan-out triggers. Every viewer has a private index of what their friends
// think (verdict_activity/{viewer}/titles/{titleKey}) and a feed
// (verdict_feeds/{viewer}/items). Only these functions write to either.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { db, C, FieldValue, friendUids, updateActivity, eachLimit, deleteQuery, expireAt } = require('./lib');
const { push } = require('./notify');

const opts = { region: 'us-central1' };

const ratingEntry = (r) => ({
  rating: r.rating,
  note: r.note || '',
  tags: r.tags || [],
  whileWatching: Boolean(r.whileWatching),
  at: r.updatedAt || FieldValue.serverTimestamp(),
});

async function actorInfo(uid) {
  const snap = await db().doc(`${C.users}/${uid}`).get();
  const d = snap.exists ? snap.data() : {};
  return { actorUid: uid, actorName: d.displayName || d.username || 'A friend', actorUsername: d.username || '' };
}

async function addFeed(viewers, item) {
  for (let i = 0; i < viewers.length; i += 400) {
    const batch = db().batch();
    for (const v of viewers.slice(i, i + 400)) {
      batch.set(db().collection(`${C.feeds}/${v}/items`).doc(), { ...item, at: FieldValue.serverTimestamp(), expireAt: expireAt() });
    }
    await batch.commit();
  }
}

/* ── Ratings ──────────────────────────────────────────────────────────── */

exports.verdictOnRatingWrite = onDocumentWritten({ ...opts, document: `${C.ratings}/{id}` }, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const r = after || before;
  if (!r || !r.uid || !r.titleKey) return;

  const friends = await friendUids(r.uid);
  if (!friends.length) return;

  await eachLimit(friends, 10, (f) =>
    updateActivity(f, r.titleKey, (a) => {
      if (after) {
        a.ratings[r.uid] = ratingEntry(after);
        a.mediaType = after.mediaType;
        a.tmdbId = after.tmdbId;
        if (after.title) a.title = after.title;
      } else {
        delete a.ratings[r.uid];
      }
    }),
  );

  // A feed item for a new verdict or a changed one. Note-only edits don't.
  if (after && (!before || before.rating !== after.rating)) {
    await addFeed(friends, {
      ...(await actorInfo(r.uid)),
      type: before ? 'rerated' : 'rated',
      titleKey: after.titleKey,
      mediaType: after.mediaType,
      tmdbId: after.tmdbId,
      title: after.title || null,
      rating: after.rating,
      previousRating: before ? before.rating : null,
      note: after.note || '',
      whileWatching: Boolean(after.whileWatching),
    });
  }
});

/* ── Lists ────────────────────────────────────────────────────────────── */

exports.verdictOnListWrite = onDocumentWritten({ ...opts, document: `${C.lists}/{id}` }, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const l = after || before;
  if (!l || !l.uid || !l.titleKey) return;

  const wasWatching = before && before.status === 'watching';
  const isWatching = after && after.status === 'watching';
  const finishedNow = after && after.status === 'finished' && (!before || before.status !== 'finished');
  if (wasWatching === isWatching && !finishedNow) return;

  const friends = await friendUids(l.uid);
  if (!friends.length) return;

  if (wasWatching !== isWatching) {
    await eachLimit(friends, 10, (f) =>
      updateActivity(f, l.titleKey, (a) => {
        if (isWatching) {
          a.watching[l.uid] = after.startedAt || FieldValue.serverTimestamp();
          a.mediaType = after.mediaType;
          a.tmdbId = after.tmdbId;
          if (after.title) a.title = after.title;
        } else {
          delete a.watching[l.uid];
        }
      }),
    );
  }

  if ((isWatching && !wasWatching) || finishedNow) {
    await addFeed(friends, {
      ...(await actorInfo(l.uid)),
      type: finishedNow ? 'finished' : 'started',
      titleKey: l.titleKey,
      mediaType: after.mediaType,
      tmdbId: after.tmdbId,
      title: after.title || null,
    });
  }
});

/* ── Connections ──────────────────────────────────────────────────────── */

// Copy everything `from` has rated or is watching into `to`'s index.
async function backfill(from, to) {
  const [ratings, watching] = await Promise.all([
    db().collection(C.ratings).where('uid', '==', from).get(),
    db().collection(C.lists).where('uid', '==', from).where('status', '==', 'watching').get(),
  ]);
  const byTitle = new Map();
  ratings.docs.forEach((d) => byTitle.set(d.data().titleKey, { rating: d.data() }));
  watching.docs.forEach((d) => {
    const k = d.data().titleKey;
    byTitle.set(k, { ...(byTitle.get(k) || {}), list: d.data() });
  });
  await eachLimit([...byTitle.entries()], 10, ([titleKey, { rating, list }]) =>
    updateActivity(to, titleKey, (a) => {
      const src = rating || list;
      a.mediaType = src.mediaType;
      a.tmdbId = src.tmdbId;
      if (src.title) a.title = src.title;
      if (rating) a.ratings[from] = ratingEntry(rating);
      if (list) a.watching[from] = list.startedAt || FieldValue.serverTimestamp();
    }),
  );
}

// Remove every trace of `gone` from `viewer`'s index and feed.
async function scrub(gone, viewer) {
  const [byRating, byWatching] = await Promise.all([
    db().collection(`${C.activity}/${viewer}/titles`).where(`ratings.${gone}.rating`, 'in', ['up', 'meh', 'down']).get(),
    db().collection(`${C.activity}/${viewer}/titles`).orderBy(`watching.${gone}`).get(),
  ]);
  const keys = new Set([...byRating.docs, ...byWatching.docs].map((d) => d.id));
  await eachLimit([...keys], 10, (k) =>
    updateActivity(viewer, k, (a) => {
      delete a.ratings[gone];
      delete a.watching[gone];
    }),
  );
  await deleteQuery(db().collection(`${C.feeds}/${viewer}/items`).where('actorUid', '==', gone));
}

exports.verdictOnConnectionWrite = onDocumentWritten({ ...opts, document: `${C.connections}/{pairId}` }, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;

  if (!before && after && after.status === 'pending') {
    const to = after.users.find((u) => u !== after.requestedBy);
    const a = await actorInfo(after.requestedBy);
    await push(to, { title: 'Friend request', body: `${a.actorName} wants to be friends on Verdict.`, data: { kind: 'request', uid: after.requestedBy } });
    return;
  }

  if (after && after.status === 'accepted' && (!before || before.status !== 'accepted')) {
    const [x, y] = after.users;
    const accepter = after.users.find((u) => u !== after.requestedBy);
    const a = await actorInfo(accepter);
    await Promise.all([
      backfill(x, y),
      backfill(y, x),
      push(after.requestedBy, { title: 'Request accepted', body: `${a.actorName} accepted your friend request.`, data: { kind: 'accepted', uid: accepter } }),
    ]);
    return;
  }

  if (before && before.status === 'accepted' && !after) {
    const [x, y] = before.users;
    await Promise.all([scrub(x, y), scrub(y, x)]);
  }
});

exports._internal = { backfill, scrub };
