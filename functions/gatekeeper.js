// Cloud Functions for Gatekeeper — the parental web-filter backend.
//
// The child's Chrome extension is deliberately NOT a Firebase-auth client.
// It authenticates to this HTTP API with a per-device bearer token minted at
// pairing time, and every read/write here runs through the Admin SDK (which
// bypasses Firestore security rules). That does two things the browser-only
// version could not:
//
//   1. The Anthropic API key never leaves the server. The extension asks
//      `/screen` to run a prompt; the key lives in the household's private
//      config doc, readable only here. (This is the fix for "anyone with
//      devtools on the kid's profile can read the key".)
//   2. Every decision, session, and request is mirrored to the household's
//      Firestore tree, so a parent signed into the web app sees the live
//      history and can approve or deny access requests in real time.
//
// Token format is `<householdId>.<deviceId>.<secret>`; only the SHA-256 of
// <secret> is stored, on the device doc. See apps/gatekeeper/README.md.

const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PAIRING_TTL_MS = 15 * 60 * 1000;      // a pairing code is good for 15 min
const MAX_EVENTS_PER_CALL = 50;

const db = () => getFirestore();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const householdRef = (hid) => db().collection('gatekeeper_households').doc(hid);

// ── tiny HTTP helpers ────────────────────────────────────────────────────
function send(res, status, body) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.status(status).json(body);
}

// Resolve + verify the bearer token, returning { hid, deviceId } or null.
// Touches lastSeenAt as a cheap "extension is alive" signal for the parent UI.
async function authDevice(req) {
  const header = req.get('Authorization') || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [hid, deviceId, secret] = raw.split('.');
  if (!hid || !deviceId || !secret) return null;
  const ref = householdRef(hid).collection('devices').doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const dev = snap.data();
  if (dev.type !== 'extension' || dev.tokenHash !== sha256(secret)) return null;
  ref.set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  return { hid, deviceId };
}

// ── the extension-facing HTTP API ────────────────────────────────────────
// One path-routed function so the extension only needs one host permission.
exports.gatekeeperApi = onRequest(
  async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    // Path is like "/screen" (or "/gatekeeperApi/screen" behind some rewrites).
    const path = req.path.replace(/^\/gatekeeperApi/, '').replace(/\/+$/, '') || '/';

    try {
      // Pairing needs no token — it exchanges a code for one.
      if (path === '/pair' && req.method === 'POST') return await pair(req, res);

      const auth = await authDevice(req);
      if (!auth) return send(res, 401, { error: 'bad_token' });

      if (path === '/screen'   && req.method === 'POST') return await screen(req, res, auth);
      if (path === '/event'    && req.method === 'POST') return await putEvents(req, res, auth);
      if (path === '/session'  && req.method === 'POST') return await putSession(req, res, auth);
      if (path === '/request'  && req.method === 'POST') return await createRequest(req, res, auth);
      if (path === '/verdicts' && req.method === 'GET')  return await verdicts(req, res, auth);
      if (path === '/config'   && req.method === 'GET')  return await config(req, res, auth);
      if (path === '/unpair'   && req.method === 'POST') return await unpair(req, res, auth);

      return send(res, 404, { error: 'not_found', path });
    } catch (e) {
      console.error('gatekeeperApi error', path, e);
      return send(res, 500, { error: 'server_error', message: String(e.message || e) });
    }
  }
);

// POST /pair { code, label } → mint a device token for this extension.
async function pair(req, res) {
  const { code, label } = req.body || {};
  if (!code) return send(res, 400, { error: 'missing_code' });
  const codeRef = db().collection('gatekeeper_pairing').doc(String(code).trim().toUpperCase());
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) return send(res, 404, { error: 'invalid_code' });
  const { householdId, createdAt } = codeSnap.data();
  const ageMs = Date.now() - (createdAt?.toMillis?.() || 0);
  if (ageMs > PAIRING_TTL_MS) {
    await codeRef.delete().catch(() => {});
    return send(res, 410, { error: 'expired_code' });
  }
  const hSnap = await householdRef(householdId).get();
  if (!hSnap.exists) return send(res, 404, { error: 'invalid_code' });

  const deviceId = crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  await householdRef(householdId).collection('devices').doc(deviceId).set({
    type: 'extension',
    label: (label && String(label).slice(0, 60)) || 'Kid’s browser',
    tokenHash: sha256(secret),
    createdAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  });
  await codeRef.delete().catch(() => {});     // single use

  const h = hSnap.data();
  return send(res, 200, {
    householdId,
    deviceId,
    deviceToken: `${householdId}.${deviceId}.${secret}`,
    kidName: h.kidName || '',
    kidAge: h.kidAge || null,
    projectContext: h.projectContext || '',
  });
}

// POST /screen { model, system, userText, maxTokens } → proxy to Anthropic
// with the household's server-held key. The extension never sees the key.
async function screen(req, res, { hid }) {
  const { model, system, userText, maxTokens } = req.body || {};
  if (!model || !userText) return send(res, 400, { error: 'missing_fields' });
  const cfg = await householdRef(hid).collection('private').doc('config').get();
  const apiKey = cfg.exists ? cfg.data().anthropicKey : null;
  if (!apiKey) return send(res, 424, { error: 'no_key' });   // parent hasn't set one

  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(Number(maxTokens) || 400, 1500),
      system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : undefined,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    return send(res, 502, { error: 'anthropic_error', status: r.status, detail: body.slice(0, 300) });
  }
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  // Best-effort usage record so the parent can see spend building up.
  if (data.usage) {
    householdRef(hid).set({
      usage: {
        inputTokens: FieldValue.increment(data.usage.input_tokens || 0),
        outputTokens: FieldValue.increment(data.usage.output_tokens || 0),
        calls: FieldValue.increment(1),
        lastCallAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true }).catch(() => {});
  }
  return send(res, 200, { text });
}

// POST /event { events: [...] } — mirror activity log entries into Firestore.
async function putEvents(req, res, { hid }) {
  const events = Array.isArray(req.body?.events) ? req.body.events : [req.body?.event].filter(Boolean);
  if (!events.length) return send(res, 400, { error: 'no_events' });
  const col = householdRef(hid).collection('activity');
  const batch = db().batch();
  for (const e of events.slice(0, MAX_EVENTS_PER_CALL)) {
    const ref = e.id ? col.doc(String(e.id)) : col.doc();
    batch.set(ref, {
      ...e,
      createdAt: e.ts ? new Date(e.ts) : FieldValue.serverTimestamp(),
      syncedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return send(res, 200, { ok: true, count: Math.min(events.length, MAX_EVENTS_PER_CALL) });
}

// POST /session { id, goal, active, startedAt, endedAt } — upsert a session.
async function putSession(req, res, { hid }) {
  const s = req.body || {};
  if (!s.id) return send(res, 400, { error: 'missing_id' });
  await householdRef(hid).collection('sessions').doc(String(s.id)).set({
    goal: s.goal || '',
    active: !!s.active,
    startedAt: s.startedAt ? new Date(s.startedAt) : FieldValue.serverTimestamp(),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return send(res, 200, { ok: true });
}

// POST /request { kind, target, reason, topic, context, sessionGoal, title }
// → a pending access request the parent sees live (and gets pushed about).
async function createRequest(req, res, { hid }) {
  const b = req.body || {};
  if (!b.target && !b.reason) return send(res, 400, { error: 'empty_request' });
  const ref = await householdRef(hid).collection('requests').add({
    kind: b.kind || 'page',
    target: String(b.target || '').slice(0, 500),
    title: String(b.title || '').slice(0, 300),
    reason: String(b.reason || '').slice(0, 1000),
    topic: String(b.topic || '').slice(0, 120),
    context: String(b.context || '').slice(0, 500),
    sessionGoal: String(b.sessionGoal || '').slice(0, 300),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    decidedAt: null,
    decidedBy: null,
    note: '',
  });
  return send(res, 200, { ok: true, requestId: ref.id });
}

// GET /verdicts?since=<ms> — requests decided since the given time, so the
// extension can unblock (or keep blocking) without a socket.
async function verdicts(req, res, { hid }) {
  const since = Number(req.query.since) || 0;
  const snap = await householdRef(hid).collection('requests')
    .where('status', 'in', ['approved', 'denied'])
    .orderBy('decidedAt', 'desc')
    .limit(25)
    .get();
  const out = [];
  let newest = since;
  snap.forEach((d) => {
    const r = d.data();
    const decidedMs = r.decidedAt?.toMillis?.() || 0;
    if (decidedMs > since) {
      out.push({
        requestId: d.id, kind: r.kind, target: r.target, topic: r.topic,
        status: r.status, note: r.note || '', decidedAt: decidedMs,
      });
      newest = Math.max(newest, decidedMs);
    }
  });
  return send(res, 200, { verdicts: out, now: Date.now(), newest });
}

// GET /config — cloud-managed settings the parent app can push to the gate.
async function config(req, res, { hid }) {
  const snap = await householdRef(hid).get();
  const h = snap.data() || {};
  return send(res, 200, {
    kidName: h.kidName || '',
    kidAge: h.kidAge || null,
    projectContext: h.projectContext || '',
    settings: h.settings || {},
    hasKey: await hasKey(hid),
  });
}

async function hasKey(hid) {
  const cfg = await householdRef(hid).collection('private').doc('config').get();
  return cfg.exists && !!cfg.data().anthropicKey;
}

// POST /unpair — the extension removes its own device record.
async function unpair(req, res, { hid, deviceId }) {
  await householdRef(hid).collection('devices').doc(deviceId).delete().catch(() => {});
  return send(res, 200, { ok: true });
}

// ── push notifications ───────────────────────────────────────────────────
// When the child raises a request, fan a web-push out to every parent device
// registered on the household. Requires the project's Web Push (VAPID) cert to
// be configured; the parent app registers FCM tokens under devices/.
exports.gatekeeperOnRequest = onDocumentCreated(
  'gatekeeper_households/{hid}/requests/{rid}',
  async (event) => {
    const { hid, rid } = event.params;
    const r = event.data?.data();
    if (!r) return;

    const devices = await householdRef(hid).collection('devices')
      .where('type', '==', 'parent').get();
    const tokens = [];
    devices.forEach((d) => { if (d.data().fcmToken) tokens.push(d.data().fcmToken); });
    if (!tokens.length) return;

    const hSnap = await householdRef(hid).get();
    const kidName = hSnap.data()?.kidName || 'Your kid';
    const body = r.reason
      ? `${kidName}: “${String(r.reason).slice(0, 120)}”`
      : `${kidName} wants to open ${String(r.target).slice(0, 120)}`;

    const resp = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: 'Gatekeeper — access request', body },
      data: { hid, requestId: rid, kind: r.kind || 'page', target: String(r.target || '') },
      webpush: {
        fcmOptions: { link: 'https://igatekeeper.web.app/?request=' + rid },
        notification: { icon: '/icon-192.png', tag: 'gk-' + rid, requireInteraction: true },
      },
    });
    // Prune tokens the push service has retired.
    resp.responses.forEach((rr, i) => {
      const code = rr.error?.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') {
        devices.docs[i].ref.delete().catch(() => {});
      }
    });
  }
);
