// ---------------------------------------------------------------------------
// Narrative Lab: Cloud Functions entry points (private tool at
// /tools/narrative-lab).
//
//   nlItemWritten  nl_items/{id} written → run that item's next stage
//   nlStatus       callable, admin only → key state, library, settings, spend
//   nlCheckKey     callable, admin only → confirm the stored key works
//   nlRescore      callable, admin only → rerun an item from a given stage
//   nlDeleteItem   callable, admin only → remove an item, its capture and edges
//   nlPublic       HTTPS, public → /api/narrative/share/<token> (a share's
//                  snapshot) and /api/narrative/share/<token>/suggest (a
//                  viewer's suggestion). Behind a Hosting rewrite.
//
// Each stage completion writes the item doc, which fires nlItemWritten again
// for the next stage. retry stays off: a failed stage marks the item failed
// and resumable, which is visible, where a silent redelivery isn't.
// ---------------------------------------------------------------------------

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const store = require('./store');
const { runItem } = require('./pipeline');
const { STAGES } = require('./stages');
const { LIBRARY } = require('./library');
const { MODELS, EFFORTS, clientFor, describeError } = require('./llm');
const { GENRE_BASELINE_MIN, PROFILE_MIN_ITEMS } = require('./scoring');
const SH = require('./share');

const { col, now } = store;

exports.nlItemWritten = onDocumentWritten(
  { document: 'nl_items/{itemId}', timeoutSeconds: 540, memory: '512MiB', maxInstances: 5, retry: false },
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || after.status !== 'queued') return;
    await runItem(event.params.itemId);
  }
);

const requireAdmin = (request) => {
  if (!store.isAdminToken(request.auth?.token)) throw new HttpsError('permission-denied', 'Not allowed.');
};

exports.nlStatus = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  requireAdmin(request);
  const [{ source }, settings, spend] = await Promise.all([store.readApiKey(), store.readSettings(), store.monthSpend()]);
  return {
    keySet: !!source,
    keySource: source,
    library: LIBRARY,
    settings,
    defaults: store.DEFAULT_SETTINGS,
    models: MODELS,
    efforts: EFFORTS,
    stages: STAGES,
    spend: { month: store.monthKey(), usd: spend },
    thresholds: { genreBaseline: GENRE_BASELINE_MIN, profileMin: PROFILE_MIN_ITEMS },
  };
});

exports.nlCheckKey = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  requireAdmin(request);
  const { key, source } = await store.readApiKey();
  if (!key) return { ok: false, message: 'No key saved yet.' };
  try {
    const page = await clientFor(key).models.list({ limit: 50 });
    const ids = (page.data || []).map((m) => m.id);
    const from = source === 'seasonal-box' ? ' (using the Seasonal Box key)' : '';
    return { ok: true, message: `Key works${from}. ${ids.length} models visible.` };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
});

const RESCORE_FROM = ['capture', 'extract', 'blind', 'resolve', 'relate', 'narrate', 'writeback'];

exports.nlRescore = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  requireAdmin(request);
  const { itemId, from } = request.data || {};
  if (typeof itemId !== 'string' || !RESCORE_FROM.includes(from)) throw new HttpsError('invalid-argument', 'itemId and a stage are required.');
  const ref = col('items').doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such item.');
  if (snap.data().status === 'running' && snap.data().claim?.until > Date.now()) {
    throw new HttpsError('failed-precondition', 'That item is running a stage right now.');
  }
  const patch = { status: 'queued', stage: from, error: null, claim: null, rescoredAt: now() };
  // Rerunning anything at or before narrate must redo narrate too.
  if (RESCORE_FROM.indexOf(from) <= RESCORE_FROM.indexOf('narrate')) patch.narrativeDoneAt = null;
  // Rerunning relate re-analyzes every edge into this item.
  if (RESCORE_FROM.indexOf(from) <= RESCORE_FROM.indexOf('relate')) {
    const edges = await col('edges').where('to', '==', itemId).get();
    const b = store.db().batch();
    edges.docs.forEach((d) => d.data().from && b.update(d.ref, { status: 'pending', libraryVersion: null }));
    await b.commit();
  }
  await ref.update(patch);
  await store.log({ event: 'rescore', itemId, from });
  return { ok: true };
});

exports.nlDeleteItem = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 60 }, async (request) => {
  requireAdmin(request);
  const { itemId } = request.data || {};
  if (typeof itemId !== 'string' || !itemId) throw new HttpsError('invalid-argument', 'itemId is required.');
  const ref = col('items').doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  const b = store.db().batch();
  const into = await col('edges').where('to', '==', itemId).get();
  into.docs.forEach((d) => b.delete(d.ref));
  // Edges out of it go back to "missing", so the downstream item still shows
  // the reference and can be pointed at a fresh capture.
  const out = await col('edges').where('from', '==', itemId).get();
  out.docs.forEach((d) => b.update(d.ref, { from: null, status: 'missing', fidelity: null }));
  b.delete(col('raw').doc(itemId));
  b.delete(ref);
  await b.commit();
  await store.log({ event: 'deleted', itemId, title: snap.data().context?.title || '' });
  return { ok: true, edgesRemoved: into.size, edgesOrphaned: out.size };
});

// ── Public share links ──────────────────────────────────────────────────────
// The only way anyone but Josh reads Narrative Lab. A share token is a
// document id in nl_shares (random, 27 characters); turning a share off takes
// effect on the next request, because nothing is cached.

const send = (res, status, body) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.status(status).json(body);
};

const GONE = {
  missing: [404, 'This link does not exist.'],
  revoked: [410, 'This link has been turned off by its owner.'],
  expired: [410, 'This link has expired.'],
};

const loadForShare = async (share) => {
  const edges = (await col('edges').limit(5000).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  let items;
  if (share.scope === 'lab') {
    items = (await col('items').where('status', '==', 'done').limit(SH.LAB_MAX_ITEMS * 2).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    const ids = new Set(share.scope === 'cascade' ? SH.cascadeIds(share.targetId, edges) : [share.targetId]);
    if (share.scope === 'item') for (const e of edges) {
      if (e.to === share.targetId && e.from) ids.add(e.from);
      if (e.from === share.targetId) ids.add(e.to);
    }
    const refs = [...ids].map((id) => col('items').doc(id));
    const snaps = refs.length ? await store.db().getAll(...refs) : [];
    items = snaps.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() }));
  }
  const narratives = (await col('narratives').limit(500).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  return { items, edges, narratives };
};

exports.nlPublic = onRequest({ memory: '256MiB', timeoutSeconds: 30, maxInstances: 10 }, async (req, res) => {
  const m = String(req.path || '').match(/^(?:\/api\/narrative)?\/share\/([A-Za-z0-9_-]{20,64})(\/suggest)?\/?$/);
  if (!m) return send(res, 404, { error: 'Not found.' });
  const ref = col('shares').doc(m[1]);
  const snap = await ref.get();
  const share = snap.exists ? snap.data() : null;
  const state = SH.shareState(share);
  if (state !== 'active') return send(res, GONE[state][0], { error: GONE[state][1], state });

  if (!m[2]) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Use GET.' });
    const data = await loadForShare(share);
    const snapshot = SH.buildSnapshot({ share, ...data, library: LIBRARY });
    await ref.update({ views: store.FieldValue.increment(1), lastViewedAt: now() }).catch(() => {});
    return send(res, 200, snapshot);
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!share.allowSuggestions) return send(res, 403, { error: 'This link does not take suggestions.' });
  const checked = SH.validateSuggestion(req.body);
  if (!checked.ok) {
    // A tripped honeypot gets a normal-looking answer and nothing is stored.
    if (checked.error === 'spam') return send(res, 201, { ok: true });
    return send(res, 400, { error: checked.error });
  }
  const pending = await col('suggestions').where('status', '==', 'pending').count().get();
  if (pending.data().count >= SH.MAX_PENDING) return send(res, 429, { error: 'The suggestion queue is full right now. Try again in a few days.' });
  const hour = SH.hourKey();
  const allowed = await store.db().runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() || {};
    const used = cur.hourKey === hour ? cur.hourCount || 0 : 0;
    if (used >= SH.HOURLY_SUGGESTIONS_PER_SHARE) return false;
    tx.update(ref, { hourKey: hour, hourCount: used + 1, suggestions: store.FieldValue.increment(1), lastSuggestionAt: now() });
    return true;
  });
  if (!allowed) return send(res, 429, { error: 'Too many suggestions from this link in the last hour. Try again later.' });
  const v = checked.value;
  await col('suggestions').add({
    token: m[1],
    shareLabel: share.label || '',
    url: v.url,
    text: v.text,
    title: v.title,
    author: v.author,
    publisher: v.publisher,
    note: v.note,
    name: v.name,
    contact: v.contact,
    status: 'pending',
    itemId: null,
    createdAt: now(),
  });
  await store.log({ event: 'suggestion', token: m[1], url: v.url || '', title: v.title || '' });
  return send(res, 201, { ok: true });
});
