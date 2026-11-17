// ---------------------------------------------------------------------------
// Narrative Lab: Cloud Functions entry points (private tool at
// /tools/narrative-lab).
//
//   nlItemWritten  nl_items/{id} written → run that item's next stage
//   nlStatus       callable, admin only → key state, library, settings, spend
//   nlCheckKey     callable, admin only → confirm the stored key works
//   nlRescore      callable, admin only → rerun an item from a given stage
//   nlDeleteItem   callable, admin only → remove an item, its capture and edges
//
// Each stage completion writes the item doc, which fires nlItemWritten again
// for the next stage. retry stays off: a failed stage marks the item failed
// and resumable, which is visible, where a silent redelivery isn't.
// ---------------------------------------------------------------------------

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const store = require('./store');
const { runItem } = require('./pipeline');
const { STAGES } = require('./stages');
const { LIBRARY } = require('./library');
const { MODELS, EFFORTS, clientFor, describeError } = require('./llm');
const { GENRE_BASELINE_MIN, PROFILE_MIN_ITEMS } = require('./scoring');

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
