// ---------------------------------------------------------------------------
// Seasonal Box HQ: Cloud Functions entry points.
//
//   sboxRunStep    sbox_runs/{runId} written → run one agent step (runner.js)
//   sboxProposal   sbox_proposals/{id} written → execute approved actions
//   sboxSeason     sbox_seasons/{id} written → move the season's stage
//   sboxHeartbeat  callable, admin only → evaluate seasons, queue the
//                  Daily Briefing if the last one is stale
//   sboxCheckKey   callable, admin only → confirm the stored API key works
//
// Why no cron: a scheduled function needs Cloud Scheduler enabled on the
// project, and this repo's CI deploys every function in one command, so a
// scheduler that isn't enabled would fail the whole site's deploy. The admin
// app calls sboxHeartbeat when it opens, and every proposal decision and
// season edit re-evaluates its season, so nothing waits on a timer. To add a
// true daily heartbeat later, enable Cloud Scheduler and export
// onSchedule('every day 07:00', () => heartbeat()) from here.
// ---------------------------------------------------------------------------

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { isAdminToken } = require('./config');
const { runStep, ACTIVE } = require('./runner');
const { onProposalWritten } = require('./executors');
const { evaluateSeason, heartbeat } = require('./orchestrator');
const { readApiKey } = require('./store');
const { clientFor, describeError } = require('./llm');

exports.sboxRunStep = onDocumentWritten(
  // One step can include a long Opus synthesis plus web searches, so this
  // gets the full 9 minutes. retry stays off: a failed step marks the run
  // failed and resumable, which is visible, where a silent redelivery isn't.
  { document: 'sbox_runs/{runId}', timeoutSeconds: 540, memory: '512MiB', maxInstances: 5, retry: false },
  async (event) => {
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || !ACTIVE.has(after.status)) return;
    await runStep(event.params.runId);
  }
);

exports.sboxProposal = onDocumentWritten(
  { document: 'sbox_proposals/{proposalId}', timeoutSeconds: 120, memory: '256MiB', retry: false },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    await onProposalWritten(event.params.proposalId, before, after);
  }
);

exports.sboxSeason = onDocumentWritten(
  { document: 'sbox_seasons/{seasonId}', timeoutSeconds: 60, memory: '256MiB', retry: false },
  async (event) => {
    if (!event.data?.after?.exists) return;
    await evaluateSeason(event.params.seasonId);
  }
);

const requireAdmin = (request) => {
  if (!isAdminToken(request.auth?.token)) throw new HttpsError('permission-denied', 'Not allowed.');
};

exports.sboxHeartbeat = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  const keySet = !!(await readApiKey());
  const result = await heartbeat({ briefing: keySet && request.data?.briefing !== false });
  return { keySet, ...result };
});

exports.sboxCheckKey = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  requireAdmin(request);
  const key = await readApiKey();
  if (!key) return { ok: false, message: 'No key saved yet.' };
  try {
    const page = await clientFor(key).models.list({ limit: 50 });
    const ids = (page.data || []).map((m) => m.id);
    return { ok: true, message: `Key works. ${ids.length} models visible.`, models: ids };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
});
