// End-to-end tests for the Narrative Lab pipeline: the real stages, runner,
// and writeback against the Firestore emulator, with a local fake of the
// Claude Messages API that streams scripted JSON, and a local web server for
// capture to fetch. No API key and no spend.
//
// Covers: a primary source from link to scores (capture, the blind mask, span
// location, density, sources, narratives, claims, request shape per stage);
// a derivative linked by the person and by URL (one edge, claim and narrative
// matching, transformations, fidelity, hop); a missing upstream filled in
// later (the waiting derivative is requeued and scored); a refusal then
// Retry; a duplicate trigger delivery; the monthly budget; rescore; delete.
//
//   firebase emulators:exec --only firestore --project josh-cocciardi \
//     "node functions/test/narrative-pipeline.test.mjs"
//   (needs `npm ci` in functions/ first)

import http from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Fake Claude API ─────────────────────────────────────────────────────────
// The stage is read off the system prompt; each test sets what each stage
// answers. Replies stream as SSE so the SDK's own stream assembly is used.

const requests = [];
let answers = {};
const STAGE_OF = [
  ['You prepare content', 'extract'],
  ['You tag reasoning', 'blind'],
  ['You file one new', 'resolve'],
  ['You compare a derivative', 'relate'],
  ['You read one piece', 'narrate'],
];
const sse = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);

const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = body ? JSON.parse(body) : {};
    const sys = parsed.system?.[0]?.text || '';
    const stage = (STAGE_OF.find(([p]) => sys.startsWith(p)) || [null, 'unknown'])[1];
    requests.push({ stage, body: parsed, headers: req.headers });
    const a = answers[stage];
    const reply = typeof a === 'function' ? a(parsed) : a;
    if (!reply) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: `no answer scripted for ${stage}` } }));
      return;
    }
    const stop = reply.stop || 'end_turn';
    const text = reply.text ?? JSON.stringify(reply.json ?? reply);
    const usage = { input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse(res, 'message_start', { message: { id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
    sse(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
    sse(res, 'content_block_stop', { index: 0 });
    sse(res, 'message_delta', { delta: { stop_reason: stop, stop_sequence: null, ...(stop === 'refusal' ? { stop_details: { type: 'refusal', category: 'cyber', explanation: 'scripted' } } : {}) }, usage: { output_tokens: usage.output_tokens } });
    sse(res, 'message_stop', {});
    res.end();
  });
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));

// ── Fake web pages for capture ──────────────────────────────────────────────

const PRIMARY_P = 'A new study of 400 households may suggest that remote work raises local spending, though the authors caution the sample covers only two cities. Spending rose 4 percent in the first year. ';
const pages = {
  '/primary': `<html><head><meta property="og:site_name" content="Example Times"><meta name="author" content="Dana Reyes"><title>Remote work and spending</title></head><body><article><h1>Remote work and spending</h1><p>By Dana Reyes, Example Times</p><p>${PRIMARY_P.repeat(4)}</p><p>Critics call the idea “a convenient fantasy.”</p></article></body></html>`,
  '/third': `<html><head><meta property="og:site_name" content="Policy Weekly"><title>The original memo</title></head><body><article><p>${'The memo recommends a pilot in one county before any statewide change, and notes the cost estimate is uncertain. '.repeat(6)}</p></article></body></html>`,
  '/paywall': '<html><body><p>Subscribe to keep reading.</p></body></html>',
};
const web = http.createServer((req, res) => {
  const html = pages[req.url.split('?')[0]];
  res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html || 'not found');
});
await new Promise((r) => web.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${web.address().port}`;

process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${api.address().port}`;
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'josh-cocciardi';

const { initializeApp } = require('firebase-admin/app');
initializeApp({ projectId: 'josh-cocciardi' });
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const db = getFirestore();

const { runItem } = require('../narrative/pipeline.js');
const L = require('../narrative/library.js');
const S = require('../narrative/scoring.js');

// ── Harness ─────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}${cond || detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
};
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

const clear = async () => {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/josh-cocciardi/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`could not clear Firestore emulator: ${res.status}`);
};
const get = async (c, id) => (await db.collection(c).doc(id).get()).data();
const all = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

/* Stands in for the trigger: keep running any queued item, exactly as each
   write to an item doc would fire nlItemWritten again. */
const drive = async (max = 60) => {
  for (let i = 0; i < max; i++) {
    const q = await db.collection('nl_items').where('status', '==', 'queued').get();
    if (q.empty) return;
    for (const d of q.docs) await runItem(d.id);
  }
  throw new Error('drive did not settle');
};

const submit = async (input) => {
  const ref = db.collection('nl_items').doc();
  await ref.set({ status: 'queued', stage: 'capture', input, createdAt: FieldValue.serverTimestamp() });
  return ref.id;
};

const reqsFor = (stage) => requests.filter((r) => r.stage === stage);
const userText = (r) => r.body.messages[0].content;

await clear();
await db.collection('nl_secrets').doc('anthropic').set({ apiKey: 'sk-ant-test' });

// ── 1. A primary source from its link ──────────────────────────────────────

console.log('primary source:');
answers = {
  extract: {
    title: 'Remote work and spending', author: 'Dana Reyes', publisher: 'Example Times', publishedAt: '2026-11-10T09:00:00Z',
    format: 'article', genre: 'news', language: 'en', topic: 'remote work', subjects: ['remote work', 'local economies'],
    summary: 'A small study finds remote work may raise local spending.',
    claims: [
      { text: 'Remote work may raise local spending', quote: 'may suggest that remote work raises local spending', kind: 'causal', checkable: true, material: 3 },
      { text: 'Spending rose 4 percent', quote: 'Spending rose 4 percent in the first year.', kind: 'fact', checkable: true, material: 2 },
    ],
    upstream: [],
  },
  blind: {
    findings: [
      { quote: 'a convenient fantasy.', techniqueId: 'name-calling', explanation: 'Critics label the idea.', confidence: 'medium' },
      { quote: '"a convenient fantasy."', techniqueId: 'loaded-language', explanation: 'Charged wording.', confidence: 'low' },
      { quote: 'this sentence is not in the text at all', techniqueId: 'appeal-to-fear', explanation: 'Invented.', confidence: 'high' },
    ],
  },
  resolve: {
    narratives: [{ existingId: '', name: 'Remote work revives towns', summary: 'Remote workers bring money to small places. Local economies benefit.', hero: 'remote workers', villain: '', victim: '', arbiter: 'researchers', invariants: [], impliedAction: 'Attract remote workers', role: 'originator' }],
    claimLinks: [],
  },
  narrate: {
    cast: { hero: 'remote workers', villain: '', victim: '', arbiter: 'researchers' }, inGroup: [], outGroup: [],
    maneuvers: [{ maneuverId: 'explain', quote: 'Spending rose 4 percent in the first year.', explanation: 'Gives data.', confidence: 'high', supportingFindingIds: [] }],
    invariants: [{ invariantId: 'epistemic', score: 2, rationale: 'No support cited.', supportingFindingIds: [] }],
    direction: { value: 'opening', rationale: 'States its limits.' },
    questions: [{ findingId: 'f1', question: 'Who are the critics, and what is their evidence?' }, { findingId: 'f99', question: 'Dangling.' }],
  },
};
const A = await submit({ url: `${site}/primary?utm_source=feed` });
await drive();
const a = await get('nl_items', A);
eq('done', [a.status, a.stage], ['done', 'done']);
const rawA = await get('nl_raw', A);
ok('capture stored the article text', rawA.text.includes('remote work raises local spending') && !rawA.text.includes('<p>'));
ok('url key ignores tracking', a.urlKey.endsWith('/primary'));
eq('context from extract', [a.context.author, a.context.publisher, a.context.genre], ['Dana Reyes', 'Example Times', 'news']);
eq('claims located in the text', a.claims.map((c) => c.start !== null), [true, true]);
eq('two findings located, the invented one kept apart', [a.findings.length, a.unlocatedFindings.length], [2, 1]);
eq('finding ids and layers', a.findings.map((f) => [f.id, f.layer]), [['f1', 3], ['f2', 3]]);
ok('finding quote is the original text', rawA.text.slice(a.findings[0].start, a.findings[0].end) === a.findings[0].quote);
const blindReq = reqsFor('blind')[0];
ok('blind pass never sees the author or outlet', !/Dana|Reyes|Example Times/.test(userText(blindReq)));
ok('blind pass still sees the text', userText(blindReq).includes('remote work raises local spending'));
eq('density', a.scores.densityRaw, S.densityRaw(a.findings, a.words));
eq('uncalibrated below the genre baseline', [a.scores.densityPct, a.scores.densityBaseline], [null, 0]);
eq('primary source is hop 0, no fidelity', [a.hop, a.scores.fidelity], [0, null]);
eq('unsupported invariant score capped', [a.pressure.scores.epistemic, a.pressure.capped], [1, ['epistemic']]);
eq('dangling question dropped', a.questions.length, 1);
const dana = await get('nl_sources', 'person-dana-reyes');
const outlet = await get('nl_sources', 'outlet-example-times');
ok('person and outlet sources created', dana && outlet && dana.kind === 'individual' && outlet.kind === 'outlet');
eq('source profile computed but hidden below 20 items', [dana.itemsCount, dana.profile.shown], [1, false]);
const narrs = await all('nl_narratives');
eq('narrative created and counted', [narrs.length, narrs[0].itemCount], [1, 1]);
eq('claims created', (await all('nl_claims')).length, 2);
eq('every model stage called once', ['extract', 'blind', 'resolve', 'relate', 'narrate'].map((s) => reqsFor(s).length), [1, 1, 1, 0, 1]);
const r0 = reqsFor('extract')[0].body;
eq('default model and per-stage effort', [r0.model, r0.output_config.effort, blindReq.body.output_config.effort], ['claude-opus-5-5', 'low', 'high']);
eq('structured output and refusal fallbacks', [r0.output_config.format.type, r0.fallbacks, !!reqsFor('extract')[0].headers['anthropic-beta']], ['json_schema', 'default', true]);
ok('system prompt is a cache breakpoint', r0.system[0].cache_control?.type === 'ephemeral');
ok('Opus request sends no thinking field', !('thinking' in r0));
ok('cost recorded on the item and the month', a.cost > 0 && (await all('nl_counters'))[0].usd > 0);
ok('every step timed', ['capture', 'extract', 'blind', 'resolve', 'relate', 'narrate', 'writeback'].every((s) => a.steps[s] && typeof a.steps[s].ms === 'number'));

// ── 2. A derivative of it ─────────────────────────────────────────────────

console.log('derivative:');
const claimA = a.claims[0].claimId;
const narrA = narrs[0].id;
const derivText = `HUGE: Example Times ADMITS remote work is saving small towns. Spending is up 4 percent everywhere. Wake up, people. ${'The experts finally confess what we knew. '.repeat(8)}`;
answers.extract = {
  title: 'Remote work is saving towns', author: 'Rex Viral', publisher: 'YouTube', publishedAt: '2026-11-12T09:00:00Z', format: 'video-transcript', genre: 'opinion', language: 'en',
  topic: 'remote work', subjects: [], summary: 'A creator reacts to the study.',
  claims: [{ text: 'Remote work is saving small towns', quote: 'remote work is saving small towns', kind: 'causal', checkable: true, material: 3 }],
  upstream: [{ title: 'Remote work and spending', publisher: 'Example Times', author: 'Dana Reyes', url: `${site}/primary`, relation: 'reacts-to', evidence: 'explicit-mention' }],
};
answers.blind = { findings: [{ quote: 'Wake up, people.', techniqueId: 'conversation-killer', explanation: 'Shuts down thought.', confidence: 'high' }] };
answers.resolve = (body) => ({
  narratives: [{ existingId: userText({ body }).includes(narrA) ? narrA : '', name: 'x', summary: 'x', hero: 'remote workers', villain: 'the experts', victim: '', arbiter: '', invariants: ['epistemic'], impliedAction: '', role: 'niche-adapter' }],
  claimLinks: [{ claimIndex: 0, existingClaimId: claimA }],
});
answers.relate = {
  relationConfirmed: 'reacts-to',
  carried: [
    { derivativeQuote: 'remote work is saving small towns', sourceQuote: 'may suggest that remote work raises local spending', status: 'distorted', transformationIds: ['T2', 'T5'], materiality: 3, severity: 3, note: 'Certainty escalated.' },
    { derivativeQuote: 'Spending is up 4 percent everywhere.', sourceQuote: 'Spending rose 4 percent in the first year.', status: 'distorted', transformationIds: ['T3'], materiality: 2, severity: 2, note: 'Two cities became everywhere.' },
  ],
  dropped: [{ sourceQuote: 'the authors caution the sample covers only two cities', kind: 'caveat', materiality: 3, note: 'Caveat gone.' }],
  transformations: [
    { transformationId: 'T2', derivativeQuote: 'saving small towns', sourceQuote: 'may suggest', severity: 3, confidence: 'high', note: '' },
    { transformationId: 'T5', derivativeQuote: 'Example Times ADMITS', sourceQuote: '', severity: 2, confidence: 'high', note: 'Report became admission.' },
    { transformationId: 'T1', derivativeQuote: '', sourceQuote: 'the authors caution the sample covers only two cities', severity: 3, confidence: 'high', note: '' },
  ],
  summary: 'Escalates a hedged study into a certainty.',
};
answers.narrate = {
  cast: { hero: 'remote workers', villain: 'the experts', victim: '', arbiter: 'the creator' }, inGroup: ['viewers'], outGroup: ['experts'],
  maneuvers: [{ maneuverId: 'dismay', quote: 'Wake up, people.', explanation: 'Urgency.', confidence: 'medium', supportingFindingIds: ['f1'] }],
  invariants: [{ invariantId: 'epistemic', score: 2, rationale: 'Casts experts as hiding truth.', supportingFindingIds: ['f1', 'm1'] }],
  direction: { value: 'closing', rationale: '' }, questions: [{ findingId: 'f1', question: 'What would change your mind?' }],
};
const B = await submit({ text: derivText, upstreamIds: [A] });
await drive();
const b = await get('nl_items', B);
eq('derivative done', b.status, 'done');
const edgesB = (await all('nl_edges')).filter((e) => e.to === B);
eq('person link and URL reference make one edge', edgesB.length, 1);
const eB = edgesB[0];
eq('edge analyzed', [eB.status, eB.from, eB.relation, eB.libraryVersion], ['done', A, 'reacts-to', L.VERSION]);
const wantFid = S.fidelity({ carried: [{ status: 'distorted', materiality: 3, severity: 3 }, { status: 'distorted', materiality: 2, severity: 2 }], dropped: [{ materiality: 3 }] });
eq('fidelity on the edge and the item', [eB.fidelity, b.scores.fidelity], [wantFid, wantFid]);
ok('derivative and source spans located', eB.carried[0].dSpan && eB.carried[0].sSpan && eB.dropped[0].sSpan);
eq('hop 1, lag 48h', [b.hop, eB.hop, eB.lagHours], [1, 1, 48]);
eq('transformation counts', b.transformationCounts, { T2: 1, T5: 1, T1: 1 });
const relReq = reqsFor('relate')[0];
ok('relate sees both texts', userText(relReq).includes('<source') && userText(relReq).includes('<derivative') && userText(relReq).includes('ADMITS'));
ok('resolve offered the existing narrative and claim', userText(reqsFor('resolve')[1]).includes(narrA) && userText(reqsFor('resolve')[1]).includes(claimA));
eq('narrative matched, not duplicated', [(await all('nl_narratives')).length, (await get('nl_narratives', narrA)).itemCount], [1, 2]);
const cl = await get('nl_claims', claimA);
eq('claim linked to both items', cl.itemIds.sort(), [A, B].sort());
eq('chain-supported invariant score stands', [b.pressure.scores.epistemic, b.pressure.support.epistemic], [2, ['f1', 'm1']]);
eq('direction closing', b.scores.direction, 'closing');

// ── 3. A missing upstream, filled in later ──────────────────────────────────

console.log('missing upstream:');
answers.extract = {
  title: 'Governor plans statewide rollout', author: '', publisher: 'Local Blog', publishedAt: '2026-11-13', format: 'article', genre: 'news', language: 'en', topic: 'policy', subjects: [], summary: 'Says a memo backs a statewide change.',
  claims: [{ text: 'The memo backs a statewide change', quote: 'The memo backs an immediate statewide change.', kind: 'attribution', checkable: true, material: 3 }],
  upstream: [{ title: 'The original memo', publisher: 'Policy Weekly', author: '', url: `${site}/third`, relation: 'summarizes', evidence: 'explicit-link' }],
};
answers.blind = { findings: [] };
answers.resolve = { narratives: [], claimLinks: [] };
answers.narrate = { cast: { hero: '', villain: '', victim: '', arbiter: '' }, inGroup: [], outGroup: [], maneuvers: [], invariants: [], direction: { value: 'mixed', rationale: '' }, questions: [] };
const C = await submit({ text: `The memo backs an immediate statewide change. ${'Officials will move fast on this. '.repeat(10)}` });
await drive();
const missing = (await all('nl_edges')).find((e) => e.to === C);
eq('unstored upstream is a missing edge', [missing.status, missing.from, missing.ref.url], ['missing', null, `${site}/third`]);
const relateCalls = reqsFor('relate').length;
eq('no relate call without a source', reqsFor('relate').length, relateCalls);
// A second item cites the same unstored source before anyone ingests it.
const C2 = await submit({ text: `The memo backs an immediate statewide change, another blog repeats. ${'Officials will move fast. '.repeat(10)}` });
await drive();

answers.extract = { ...answers.extract, title: 'The original memo', publisher: 'Policy Weekly', publishedAt: '2026-11-11', claims: [], upstream: [] };
answers.relate = {
  relationConfirmed: 'summarizes',
  carried: [{ derivativeQuote: 'The memo backs an immediate statewide change.', sourceQuote: 'The memo recommends a pilot in one county before any statewide change', status: 'distorted', transformationIds: ['T3'], materiality: 3, severity: 3, note: '' }],
  dropped: [], transformations: [{ transformationId: 'T3', derivativeQuote: 'immediate statewide change', sourceQuote: 'a pilot in one county', severity: 3, confidence: 'high', note: '' }], summary: '',
};
const D = await submit({ url: `${site}/third`, resolvesEdge: missing.id });
await drive();
const filled = await get('nl_edges', missing.id);
const c = await get('nl_items', C);
eq('edge now points at the new capture and is analyzed', [filled.from, filled.status], [D, 'done']);
eq('the waiting derivative was requeued and scored', [c.status, c.scores.fidelity, c.requeuedBy, c.hop], ['done', 0, D, 1]);
const c2 = await get('nl_items', C2);
const c2edge = (await all('nl_edges')).find((x) => x.to === C2);
eq('the other citing item is filled in by URL and scored too', [c2edge.from, c2edge.status, c2.status, c2.hop], [D, 'done', 'done', 1]);
eq('requeue skipped the narrate call', reqsFor('narrate').length, 5);

// ── 4. Refusal, then Retry ──────────────────────────────────────────────────

console.log('failure and retry:');
const extractOk = answers.extract;
answers.extract = { stop: 'refusal', text: '' };
const E = await submit({ text: 'Some content that a classifier declines. '.repeat(5) });
await drive();
let e = await get('nl_items', E);
eq('refusal fails at extract', [e.status, e.failedStage, e.stage], ['failed', 'extract', 'extract']);
ok('message names the refusal and its category', /declined.*cyber/i.test(e.error));
answers.extract = { ...extractOk, upstream: [] };
await db.collection('nl_items').doc(E).update({ status: 'queued' }); // what Retry does
await drive();
e = await get('nl_items', E);
eq('retry resumes at the failed stage and finishes', [e.status, e.error], ['done', null]);
eq('capture was not redone', e.steps.capture.error, undefined);

const P = await submit({ url: `${site}/paywall` });
await drive();
const p = await get('nl_items', P);
ok('unreadable page fails at capture with a paste hint', p.status === 'failed' && p.failedStage === 'capture' && /paste/i.test(p.error));

// ── 5. Duplicate delivery and the lease ─────────────────────────────────────

console.log('lease:');
const F = await submit({ text: 'Lease test content. '.repeat(10) });
await db.collection('nl_items').doc(F).update({ status: 'queued', claim: { stage: 'capture', until: Date.now() + 60000 } });
eq('a live claim blocks a second worker', await runItem(F), null);
await db.collection('nl_items').doc(F).update({ claim: { stage: 'capture', until: Date.now() - 1 } });
eq('an expired claim is taken over', await runItem(F), 'capture');
eq('a non-queued item is ignored', await runItem(A), null);
await drive();

// ── 6. Budget ───────────────────────────────────────────────────────────────

console.log('budget:');
await db.collection('nl_settings').doc('global').set({ budgetMonthlyUsd: 0.0001, model: 'not-a-model', stages: { blind: { effort: 'silly' } } });
const before = requests.length;
const G = await submit({ text: 'Budget test content. '.repeat(10) });
await drive();
const g = await get('nl_items', G);
eq('over budget fails before calling the API', [g.status, g.failedStage, requests.length - before], ['failed', 'extract', 0]);
ok('message says how to continue', /budget/i.test(g.error) && /Settings/.test(g.error));
await db.collection('nl_settings').doc('global').set({ budgetMonthlyUsd: 100, model: 'claude-sonnet-5-5', stages: { blind: { effort: 'silly' } } });
await db.collection('nl_items').doc(G).update({ status: 'queued' });
await drive();
const sonnet = requests.slice(before);
eq('a valid model in Settings is used, invalid effort falls back', [sonnet[0].body.model, sonnet.find((r) => r.stage === 'blind').body.output_config.effort], ['claude-sonnet-5-5', 'high']);
ok('Sonnet gets adaptive thinking', sonnet[0].body.thinking?.type === 'adaptive');
await db.collection('nl_settings').doc('global').delete();

// ── 7. Rescore and delete (the callables' effects) ──────────────────────────

console.log('rescore and delete:');
const { nlRescore, nlDeleteItem } = require('../narrative/index.js');
const asJosh = { auth: { token: { email: 'joshua.cocciardi@gmail.com', email_verified: true } } };
let denied = false;
try {
  await nlRescore.run({ data: { itemId: B, from: 'relate' }, auth: { token: { email: 'eve@example.com', email_verified: true } } });
} catch (err) {
  denied = err.code === 'permission-denied';
}
ok('a stranger cannot rescore', denied);
const relBefore = reqsFor('relate').length;
answers.relate = { ...answers.relate, relationConfirmed: 'reacts-to', carried: [], dropped: [], transformations: [] };
await nlRescore.run({ data: { itemId: B, from: 'relate' }, ...asJosh });
await drive();
eq('rescore from relate reruns the edge, not narrate', [reqsFor('relate').length - relBefore, (await get('nl_items', B)).status], [1, 'done']);
const res = await nlDeleteItem.run({ data: { itemId: A }, ...asJosh });
eq('delete removes the item and capture, orphans edges out of it', [!!(await get('nl_items', A)), !!(await get('nl_raw', A)), res.edgesOrphaned], [false, false, 1]);
eq('orphaned edge goes back to missing', (await get('nl_edges', `${A}__${B}`)).status, 'missing');

api.close();
web.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
