// ---------------------------------------------------------------------------
// Narrative Lab: runs one stage of one item per trigger delivery.
//
// An item is a small state machine on its own document:
//   status  queued → running → queued (next stage) … → done
//                          └→ failed (Retry sets it queued again, same stage)
//   stage   the stage to run next (stages.js STAGES)
//
// The claim lease makes a duplicate delivery of the same trigger a no-op, and
// an expired lease (a crashed or timed-out worker) lets Retry take over. Every
// stage's own writes are idempotent, so re-running a stage is always safe.
// ---------------------------------------------------------------------------

const { HANDLERS, STAGES } = require('./stages');
const store = require('./store');
const { StageError } = require('./llm');

const { col, db, now, FieldValue } = store;

const LEASE_MS = 10 * 60 * 1000; // longer than the function timeout

const claim = async (ref) =>
  db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const item = snap.data();
    if (item.status !== 'queued') return null;
    if (item.claim && item.claim.until > Date.now()) return null; // another worker has it
    const stage = STAGES.includes(item.stage) ? item.stage : 'capture';
    tx.update(ref, { status: 'running', stage, claim: { stage, until: Date.now() + LEASE_MS }, error: null });
    return { ...item, stage };
  });

/* Runs the item's next stage. Returns the stage that ran, or null when there
   was nothing to claim. */
const runItem = async (id) => {
  const ref = col('items').doc(id);
  const item = await claim(ref);
  if (!item) return null;
  const stage = item.stage;
  const settings = await store.readSettings();
  const spend = { usd: 0, model: null };
  const started = Date.now();
  const stepInfo = () => ({ ms: Date.now() - started, cost: Math.round(spend.usd * 1e6) / 1e6, model: spend.model, at: new Date().toISOString() });

  try {
    let apiKey = null;
    if (store.LLM_STAGES.includes(stage)) {
      apiKey = (await store.readApiKey()).key;
      if (!apiKey) throw new StageError('No Anthropic API key is saved yet. Add one in Settings, then press Retry.');
    }
    const result = await HANDLERS[stage]({ id, item: { id, ...item }, settings, apiKey, spend });
    const next = result.next;
    await ref.update({
      ...result.update,
      status: next ? 'queued' : 'done',
      stage: next || 'done',
      claim: null,
      cost: FieldValue.increment(spend.usd),
      [`steps.${stage}`]: stepInfo(),
      updatedAt: now(),
    });
    if (result.after) await result.after();
  } catch (e) {
    const message = e instanceof StageError ? e.message : `Unexpected error in ${stage}: ${String((e && e.message) || e).slice(0, 400)}`;
    if (!(e instanceof StageError)) console.error(`narrative ${id} ${stage}`, e);
    await ref.update({
      status: 'failed',
      error: message,
      failedStage: stage,
      retryable: !!(e && e.retryable),
      claim: null,
      cost: FieldValue.increment(spend.usd),
      [`steps.${stage}`]: { ...stepInfo(), error: message },
      updatedAt: now(),
    });
    await store.log({ event: 'failed', itemId: id, stage, error: message });
  }
  return stage;
};

module.exports = { runItem, claim, LEASE_MS };
