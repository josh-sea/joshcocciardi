// ---------------------------------------------------------------------------
// Executors: the only code that acts on a proposal, and only once it is
// approved (spec 1.3, 7).
//
// Idempotent by construction: a transaction moves `execution` from null to
// "running" keyed by the proposal id, so a duplicate trigger delivery finds it
// already claimed and does nothing.
//
// Internal actions (approving a brief, updating the maker directory, moving a
// stage, lifting a budget cap) execute here for real. External ones (email,
// purchase orders, publishing, labels, customer replies, refunds) have no live
// integration yet, so approving one marks it "manual": the drafted action is
// handed back to Josh to carry out, and he marks it done with what it
// actually cost. That keeps rule 10 of the MVP criteria true in the strongest
// form: nothing leaves the building without Josh, because Josh is the one who
// sends it.
// ---------------------------------------------------------------------------

const { col, db, now, FieldValue, parseJson, recordSpend } = require('./store');
const { ACTIONS } = require('./config');
const { evaluateSeason } = require('./orchestrator');

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `maker-${Date.now()}`;

const claimExecution = (ref) =>
  db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.data();
    if (!p || p.status !== 'approved' || p.execution) return null;
    tx.update(ref, { execution: { status: 'running', key: ref.id, startedAt: new Date().toISOString() } });
    return p;
  });

// ── Brief approvals ─────────────────────────────────────────────────────────

const upsertMakers = async (makers, { seasonId, source }) => {
  const batch = db().batch();
  const ids = [];
  for (const m of makers) {
    if (!m || !(m.name || m.makerName)) continue;
    const name = m.name || m.makerName;
    const id = slug(name);
    ids.push(id);
    batch.set(
      col('makers').doc(id),
      {
        name,
        location: m.location || null,
        distanceMiles: m.distanceMiles ?? null,
        website: m.website || null,
        contact: m.contact || null,
        products: m.products || [],
        capacity: m.capacity || null,
        leadTime: m.leadTime || null,
        notes: m.notes || null,
        status: m.status || 'prospect',
        seasonIds: seasonId ? FieldValue.arrayUnion(seasonId) : [],
        source: source || null,
        updatedAt: now(),
      },
      { merge: true }
    );
  }
  await batch.commit();
  return ids;
};

const BRIEF_EFFECTS = {
  /* Selected themes become theme records on the season. */
  async trend(brief, content, decision) {
    const themes = Array.isArray(content.themes) ? content.themes : [];
    const pick = Array.isArray(decision?.selection) && decision.selection.length ? decision.selection.map(Number) : themes.map((_, i) => i);
    const batch = db().batch();
    const ids = [];
    pick.forEach((i) => {
      const t = themes[i];
      if (!t) return;
      const ref = col('themes').doc();
      ids.push(ref.id);
      batch.set(ref, {
        seasonId: brief.seasonId,
        briefId: brief.id,
        name: t.name || `Theme ${i + 1}`,
        story: t.story || '',
        paletteJson: JSON.stringify(t.palette || []),
        scentNotes: t.scentNotes || [],
        categoriesJson: JSON.stringify(t.categoriesByKit || {}),
        moodImagesJson: JSON.stringify(t.moodImages || []),
        approved: true,
        createdAt: now(),
      });
    });
    if (brief.seasonId) batch.update(col('seasons').doc(brief.seasonId), { themeIds: ids });
    await batch.commit();
    return `${ids.length} theme(s) approved.`;
  },

  /* Approved makers (best and backup per slot, or Josh's selection) go into
     the Makers directory as prospects. */
  async scout(brief, content, decision) {
    const found = Array.isArray(content.found) ? content.found : [];
    const byName = new Map(found.map((m) => [String(m.makerName || m.name || '').toLowerCase(), m]));
    let names;
    if (Array.isArray(decision?.selection) && decision.selection.length) names = decision.selection;
    else {
      const slots = content.recommendation?.slots || [];
      names = [...new Set(slots.flatMap((s) => [s.best, s.backup]).filter(Boolean))];
    }
    const makers = names.map((n) => byName.get(String(n).toLowerCase()) || { name: n });
    const ids = await upsertMakers(makers, { seasonId: brief.seasonId, source: `scout brief ${brief.id}` });
    return `${ids.length} maker(s) added to the directory.`;
  },

  /* The approved Box Plan's kits become the season's kit records. */
  async boxPlan(brief, content) {
    const kits = Array.isArray(content.kits) ? content.kits : [];
    const batch = db().batch();
    for (const k of kits) {
      batch.set(col('kits').doc(`${brief.seasonId}-${slug(k.type)}`), {
        seasonId: brief.seasonId,
        type: k.type || 'kit',
        contentsJson: JSON.stringify(k.contents || []),
        unitCost: Number(k.unitCost) || null,
        briefId: brief.id,
        updatedAt: now(),
      });
    }
    await batch.commit();
    return `${kits.length} kit(s) saved for the season.`;
  },
};

const approveBrief = async (proposal) => {
  const ref = col('briefs').doc(proposal.briefId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('The brief no longer exists.');
  const brief = { id: snap.id, ...snap.data() };
  const decision = proposal.decision || {};
  const update = { status: 'approved', approvedAt: now(), decisionComment: decision.comment || null };
  let contentJson = brief.contentJson;
  if (typeof decision.editedContentJson === 'string' && parseJson(decision.editedContentJson) !== null) {
    // Josh edited the brief before approving. Keep the original for the audit.
    update.originalContentJson = brief.contentJson;
    update.contentJson = decision.editedContentJson;
    contentJson = decision.editedContentJson;
  }
  await ref.update(update);
  const effect = BRIEF_EFFECTS[brief.type];
  const result = effect ? await effect(brief, parseJson(contentJson, {}), decision) : 'Approved.';
  return { status: 'done', result };
};

// ── Everything else ─────────────────────────────────────────────────────────

const execute = async (id, p) => {
  const payload = parseJson(p.decision?.editedPayloadJson, null) || parseJson(p.payloadJson, {});
  switch (p.actionType) {
    case 'brief.approve':
      return approveBrief(p);
    case 'makers.upsert': {
      const ids = await upsertMakers(payload.makers || [], { seasonId: p.seasonId, source: `proposal ${id}` });
      return { status: 'done', result: `${ids.length} maker(s) updated.` };
    }
    case 'stage.advance': {
      const to = Number(payload.toStage);
      if (!payload.seasonId || !(to >= 1 && to <= 11)) throw new Error('stage.advance needs seasonId and toStage 1-11.');
      await col('seasons').doc(payload.seasonId).update({ stage: to, stageEnteredAt: now() });
      return { status: 'done', result: `Moved to stage ${to}.` };
    }
    case 'budget.continue': {
      const raise = Math.max(0, Number(payload.raiseUsd) || 0);
      await col('runs').doc(payload.runId).update({
        budgetExtra: FieldValue.increment(raise),
        status: 'running',
        claim: null,
        pauseReason: null,
      });
      return { status: 'done', result: `Run resumed with $${raise.toFixed(2)} more headroom.` };
    }
    default: {
      const def = ACTIONS[p.actionType];
      if (!def) throw new Error(`Unknown action type ${p.actionType}.`);
      return {
        status: 'manual',
        result: `No live integration for "${def.label}" yet. Carry it out by hand from the approved draft, then mark it done${def.money ? ' with what it actually cost' : ''}.`,
      };
    }
  }
};

/* After a decision, a run with nothing left pending is complete. */
const settleRun = async (runId) => {
  if (!runId) return;
  const runRef = col('runs').doc(runId);
  const run = (await runRef.get()).data();
  if (!run || run.status !== 'awaiting_approval') return;
  const ids = run.proposalIds || [];
  const snaps = await Promise.all(ids.map((pid) => col('proposals').doc(pid).get()));
  if (snaps.every((s) => !s.exists || s.data().status !== 'pending')) await runRef.update({ status: 'completed' });
};

const onProposalWritten = async (id, before, after) => {
  if (!after) return;
  const ref = col('proposals').doc(id);

  // Rejected: the brief is marked rejected so the season page shows it, and
  // Josh's comment rides along on any rerun.
  if (after.status === 'rejected' && before?.status !== 'rejected') {
    if (after.actionType === 'brief.approve' && after.briefId) {
      await col('briefs').doc(after.briefId).update({ status: 'rejected', decisionComment: after.decision?.comment || null });
    }
    if (after.actionType === 'budget.continue') {
      const runId = parseJson(after.payloadJson, {}).runId;
      if (runId) await col('runs').doc(runId).update({ status: 'cancelled', endedAt: now(), claim: null });
    }
    await settleRun(after.runId);
    return;
  }

  // Josh carried out a manual action: record what it cost, close it out.
  if (after.execution?.status === 'manual' && after.manual?.done && !after.manual?.recorded) {
    const amount = Number(after.manual.amountUsd) || 0;
    if (amount > 0) {
      await recordSpend({ category: 'operating', amount, agentId: after.agentId, seasonId: after.seasonId, runId: after.runId, refId: id, note: after.title });
    }
    await ref.update({
      'manual.recorded': true,
      execution: { ...after.execution, status: 'done', finishedAt: new Date().toISOString(), result: after.manual.note || 'Done by hand.' },
    });
    if (after.seasonId) await evaluateSeason(after.seasonId);
    return;
  }

  if (after.status !== 'approved' || after.execution) return;
  const p = await claimExecution(ref);
  if (!p) return;
  let outcome;
  try {
    outcome = await execute(id, p);
  } catch (e) {
    outcome = { status: 'failed', result: String(e.message || e).slice(0, 500) };
  }
  await ref.update({ execution: { status: outcome.status, key: id, result: outcome.result, finishedAt: new Date().toISOString() } });
  await settleRun(p.runId);
  if (p.seasonId) await evaluateSeason(p.seasonId);
};

module.exports = { onProposalWritten, upsertMakers, slug, BRIEF_EFFECTS };
