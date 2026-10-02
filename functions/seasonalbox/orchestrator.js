// ---------------------------------------------------------------------------
// The season stage machine (spec 6).
//
// Exit criteria are checked in code, not by a model: whether a brief is
// approved or a date has passed is a fact, and facts shouldn't cost tokens or
// be up for interpretation. The Orchestrator *agent* writes the Daily
// Briefing; this module is the part of the Orchestrator that moves seasons.
//
// evaluateSeason advances a season through every stage whose exit criteria
// are already met, then starts the owning agents for the stage it lands on.
// It runs after every executed proposal and on every heartbeat, so a season
// never waits on a cron to move.
// ---------------------------------------------------------------------------

const { col, now, readSettings, parseJson } = require('./store');
const { STAGES } = require('./config');
const { queueRun } = require('./runner');

// Agents started when a season enters each stage. Stage 8 (Lock) is handled
// in code: counts freeze on the lock date.
const STAGE_AGENTS = {
  2: ['trend-researcher'],
  3: ['maker-scout'],
  4: ['procurement'],
  5: ['procurement'],
  6: ['box-curator'],
  7: ['storefront', 'marketing'],
  9: ['fulfillment'],
  10: ['fulfillment'],
  11: ['analyst'],
};

const STAGE_TASKS = {
  2: 'Research and write the Trend Brief (vision board) for this season.',
  3: 'Find local makers for every product slot in the approved Trend Brief and write the Scout Report.',
  4: 'Calculate quantities, draft outreach to the approved makers (propose each email with email.send), then write the Outreach Packet and Quote Summary from what you know so far. Mark quotes not yet received as pending.',
  5: 'Draft a purchase order for every confirmed quote (propose each with order.create_po) and write the order summary brief.',
  6: 'Design the Box Plan: contents per kit, costs and margin per tier, maker spotlights, and insert card copy.',
  7: 'Draft the launch materials for the approved Box Plan.',
  9: 'Check expected deliveries against purchase orders and list what is still outstanding.',
  10: 'Produce the Pack Plan from the locked counts and propose label purchases.',
  11: 'Write the Season Retro.',
};

const dateReached = (iso) => !!iso && new Date(`${iso}T00:00:00`) <= new Date();

/* Facts about one season, gathered once per evaluation. */
const gather = async (seasonId) => {
  const [briefs, proposals] = await Promise.all([
    col('briefs').where('seasonId', '==', seasonId).get(),
    col('proposals').where('seasonId', '==', seasonId).get(),
  ]);
  const approved = new Set(briefs.docs.filter((d) => d.data().status === 'approved').map((d) => d.data().type));
  const pos = proposals.docs.map((d) => d.data()).filter((p) => p.actionType === 'order.create_po');
  return { approved, pos };
};

/* Whether a season may leave stage n. Returns [met, reason-if-not]. */
const exitMet = (n, season, facts) => {
  const flags = season.flags || {};
  switch (n) {
    case 1:
      return [!!(season.shipDate && season.lockDate), 'Set a ship date and lock date.'];
    case 2:
      return [facts.approved.has('trend'), 'Approve a Trend Brief.'];
    case 3:
      return [facts.approved.has('scout'), 'Approve the Scout Report shortlist.'];
    case 4:
      return [facts.approved.has('quote'), 'Approve the Quote Summary.'];
    case 5: {
      if (flags.ordersPlaced) return [true];
      const open = facts.pos.filter((p) => p.status === 'pending' || (p.status === 'approved' && p.execution?.status !== 'done'));
      const done = facts.pos.filter((p) => p.execution?.status === 'done');
      return [done.length > 0 && open.length === 0, 'Approve and send every purchase order (or mark orders placed).'];
    }
    case 6:
      return [facts.approved.has('boxPlan'), 'Approve the Box Plan.'];
    case 7:
      return [facts.approved.has('reveal') && facts.approved.has('campaign'), 'Approve the reveal and the launch campaign.'];
    case 8:
      return [dateReached(season.lockDate), `Waits for the lock date (${season.lockDate || 'not set'}).`];
    case 9:
      return [!!flags.inventoryReceived, 'Mark inventory received and checked.'];
    case 10:
      return [!!flags.allShipped, 'Mark all boxes shipped.'];
    case 11:
      return [facts.approved.has('retro'), 'Approve the Season Retro.'];
    default:
      return [false, ''];
  }
};

const startStageAgents = async (seasonId, stage, settings) => {
  if (!settings.autoStartAgents) return [];
  const ids = STAGE_AGENTS[stage] || [];
  const started = [];
  for (const agentId of ids) {
    const agent = await col('agents').doc(agentId).get();
    if (!agent.exists || agent.data().enabled === false) continue;
    // Once per stage, ever. A finished, failed, or rejected run is not
    // restarted automatically: that would spend money on every heartbeat.
    // Josh reruns from the season page, with notes.
    const existing = await col('runs').where('agentId', '==', agentId).get();
    const already = existing.docs.some((d) => d.data().seasonId === seasonId && d.data().trigger?.stage === stage);
    if (already) continue;
    const id = await queueRun({
      id: `stage-${seasonId}-${stage}-${agentId}`,
      agentId,
      seasonId,
      trigger: { type: 'stage', stage, by: 'orchestrator' },
      instructions: STAGE_TASKS[stage] || '',
    });
    if (id) started.push(id);
  }
  return started;
};

/* Moves a season forward as far as its facts allow. Returns the stages it
   passed through and the runs it started. */
const evaluateSeason = async (seasonId) => {
  const ref = col('seasons').doc(seasonId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const season = snap.data();
  if (season.status === 'complete' || season.status === 'archived') return { advanced: [] };
  const settings = await readSettings();
  const facts = await gather(seasonId);

  let stage = Number(season.stage) || 1;
  const advanced = [];
  const update = {};
  // Josh moved the season back by hand: leave it where he put it until he
  // turns auto-advance back on.
  while (!season.hold && stage <= 11) {
    const [met, reason] = exitMet(stage, season, facts);
    if (!met) {
      // Only written when it changes: this module runs from the season's own
      // write trigger, so an unconditional write would loop forever.
      if ((reason || null) !== (season.blocker || null)) update.blocker = reason || null;
      break;
    }
    if (stage === 8 && !season.lockedAt) {
      // Freeze the counts the rest of the season works from.
      update.lockedAt = now();
      update.lockedCounts = season.forecast || null;
    }
    if (stage === 11) {
      update.status = 'complete';
      if (season.blocker) update.blocker = null;
      break;
    }
    stage += 1;
    advanced.push(stage);
  }

  if (advanced.length) {
    update.stage = stage;
    update.stageEnteredAt = now();
    update.history = [...(season.history || []), ...advanced.map((n) => ({ stage: n, at: new Date().toISOString(), by: 'orchestrator' }))].slice(-40);
  }
  if (Object.keys(update).length) await ref.update(update);
  // Start agents on entry, and also for a stage whose agent was never started
  // (a season created straight into stage 2, or autostart switched on later).
  const started = advanced.length || season.stage === stage ? await startStageAgents(seasonId, stage, settings) : [];
  return { advanced, stage, started };
};

/* Daily heartbeat: move every live season and, if the last Daily Briefing is
   more than 20 hours old, ask the Orchestrator for a new one. Called by the
   admin app when it opens (see index.js for why there is no cron). */
const heartbeat = async ({ briefing = true } = {}) => {
  const seasons = await col('seasons').get();
  const results = {};
  for (const d of seasons.docs) {
    if (['complete', 'archived'].includes(d.data().status)) continue;
    results[d.id] = await evaluateSeason(d.id);
  }
  let briefingRunId = null;
  if (briefing) {
    const orch = await col('agents').doc('orchestrator').get();
    if (orch.exists && orch.data().enabled !== false) {
      const runs = await col('runs').where('agentId', '==', 'orchestrator').get();
      const latest = runs.docs.map((r) => r.data()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
      const age = latest ? Date.now() - (latest.createdAt?.toMillis?.() || 0) : Infinity;
      if (age > 20 * 3600 * 1000) {
        briefingRunId = await queueRun({
          // One per UTC day, however many tabs open HQ at once.
          id: `briefing-${new Date().toISOString().slice(0, 10)}`,
          agentId: 'orchestrator',
          trigger: { type: 'heartbeat', by: 'orchestrator' },
          instructions: 'Write the Daily Briefing.',
        });
      }
    }
  }
  return { seasons: results, briefingRunId };
};

module.exports = { evaluateSeason, heartbeat, exitMet, STAGE_AGENTS, STAGES, dateReached, parseJson };
