// ---------------------------------------------------------------------------
// Narrative Lab: the pipeline stages. One stage runs per trigger delivery
// (pipeline.js), so each gets the function's full timeout and a failure stops
// at a known stage that Retry resumes.
//
//   capture    code    fetch the page or take pasted text, store nl_raw once
//   extract    model   context packet, atomic claims, upstream references
//   blind      model   Layers 2 and 3 with author and outlet masked
//   resolve    code+   sources, derivation edges, narratives, claim matching
//   relate     model   one call per stored upstream: transformations, fidelity
//   narrate    model   Layers 4 and 5, invariant pressure, questions
//   writeback  code    scores, source and narrative profiles, downstream requeue
//
// Each handler gets { id, item, settings, apiKey, spend } and returns
// { update, next, after }. `next` is the stage to queue, or null for done;
// `after` runs once the item's own update has landed.
// ---------------------------------------------------------------------------

const L = require('./library');
const P = require('./prompts');
const S = require('./scoring');
const { extractPage, normalizeUrl, MIN_READABLE_CHARS } = require('./html');
const { redact, namesToHide, locate, locateAll, wordCount } = require('./spans');
const { buildRequest, callJson, StageError } = require('./llm');
const store = require('./store');

const { col, now, FieldValue } = store;

const MAX_RAW_BYTES = 900 * 1024; // Firestore caps a document at 1 MiB
const MAX_FETCH_BYTES = 6 * 1024 * 1024;
const MAX_EDGES_PER_PASS = 3; // keeps one relate pass well inside the timeout
const UA = 'Mozilla/5.0 (compatible; NarrativeLab/0.1; +https://www.joshcocciardi.com)';

const techniques = L.byId(L.TECHNIQUES);
const str = (x, n = 2000) => String(x == null ? '' : x).trim().slice(0, n);

// ── Model call with budget check and spend tracking ─────────────────────────

const llm = async (ctx, stage, { system, schema, user, maxTokens }) => {
  const budget = ctx.settings.budgetMonthlyUsd;
  if (budget > 0) {
    const spent = await store.monthSpend();
    if (spent >= budget) {
      throw new StageError(`This month's budget of $${budget.toFixed(2)} is used up ($${spent.toFixed(2)} spent). Raise it in Settings, then press Retry.`);
    }
  }
  const { model, effort } = ctx.settings.stages[stage];
  const req = buildRequest({ model, system, user, schema, effort, maxTokens });
  try {
    const out = await callJson(ctx.apiKey, req);
    ctx.spend.usd += out.cost;
    ctx.spend.model = out.model;
    await store.addSpend(out.cost);
    return out.data;
  } catch (e) {
    if (e.cost) {
      ctx.spend.usd += e.cost;
      await store.addSpend(e.cost);
    }
    throw e;
  }
};

const rawOf = async (id) => {
  const snap = await col('raw').doc(id).get();
  if (!snap.exists) throw new StageError('The original capture is missing. Delete this item and submit it again.');
  return snap.data();
};

const itemOf = async (id) => {
  const snap = await col('items').doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
};

const contentBlock = (tag, attrs, text) => {
  const a = Object.entries(attrs)
    .filter(([, v]) => v)
    .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "'")}"`)
    .join('');
  return `<${tag}${a}>\n${text}\n</${tag}>`;
};

// ── capture ─────────────────────────────────────────────────────────────────

const fetchPage = async (url) => {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'accept-language': 'en-US,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new StageError(`Could not reach that page (${String(e.message || e).slice(0, 120)}). Paste the text instead.`);
  }
  if (!res.ok) throw new StageError(`The page answered HTTP ${res.status}. If it is paywalled or blocks automated readers, paste the text instead.`);
  const type = res.headers.get('content-type') || '';
  if (/pdf/i.test(type)) throw new StageError('PDFs are not read yet. Paste the text instead.');
  const body = (await res.text()).slice(0, MAX_FETCH_BYTES);
  const finalUrl = res.url || url;
  if (/text\/plain/i.test(type)) {
    let host = '';
    try {
      host = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    const text = body.trim();
    return { text, links: [], readable: text.length >= MIN_READABLE_CHARS, meta: { host, publisher: host } };
  }
  return extractPage(body, finalUrl);
};

const capture = async ({ id, item }) => {
  const input = item.input || {};
  const url = str(input.url, 2000);
  const existing = await col('raw').doc(id).get();
  let raw;
  if (existing.exists) {
    raw = existing.data(); // a retry: the original capture is never rewritten
  } else {
    let text = String(input.text || '').replace(/\r\n?/g, '\n').trim();
    let meta = {};
    let links = [];
    let fetchNote = '';
    if (url) {
      try {
        const page = await fetchPage(url);
        meta = page.meta || {};
        links = page.links || [];
        if (!text) {
          if (!page.readable) throw new StageError('The page did not yield enough readable text (a paywall or a script-only page). Paste the text instead.');
          text = page.text;
        }
      } catch (e) {
        if (!text) throw e;
        fetchNote = `Used the pasted text. The link could not be read: ${String(e.message).slice(0, 200)}`;
      }
    }
    if (text.length < 20) throw new StageError('Nothing to analyze. Add a link or paste the text.');
    let truncated = false;
    while (Buffer.byteLength(text, 'utf8') > MAX_RAW_BYTES) {
      text = text.slice(0, Math.floor(text.length * 0.9));
      truncated = true;
    }
    raw = { text, url, meta, links, fetchNote, truncated, chars: text.length, words: wordCount(text), capturedAt: now() };
    await col('raw').doc(id).set(raw);
  }
  return {
    update: {
      capture: {
        meta: raw.meta || {},
        words: raw.words,
        chars: raw.chars,
        truncated: !!raw.truncated,
        linkCount: (raw.links || []).length,
        fetchNote: raw.fetchNote || '',
      },
      words: raw.words,
      urlKey: normalizeUrl(url),
    },
    next: 'extract',
  };
};

// ── extract ─────────────────────────────────────────────────────────────────

const OVERRIDABLE = ['title', 'author', 'publisher', 'publishedAt', 'genre', 'format'];

const extract = async (ctx) => {
  const { id, item } = ctx;
  const raw = await rawOf(id);
  const input = item.input || {};
  const overrides = Object.fromEntries(OVERRIDABLE.map((k) => [k, str(input[k], 300)]).filter(([, v]) => v));
  const declared = { ...(raw.meta || {}), url: raw.url || '' };
  const links = (raw.links || []).slice(0, 80);
  const user = [
    `Metadata the page declared (may be empty or wrong):\n${JSON.stringify(declared)}`,
    Object.keys(overrides).length ? `The person submitting this says (treat as correct):\n${JSON.stringify(overrides)}` : '',
    links.length ? `Outbound links inside the content:\n${links.map((l) => `- ${l.href}${l.text ? ` (${l.text})` : ''}`).join('\n')}` : '',
    contentBlock('content', {}, raw.text),
  ]
    .filter(Boolean)
    .join('\n\n');
  const r = await llm(ctx, 'extract', { system: P.EXTRACT_SYSTEM, schema: P.EXTRACT_SCHEMA, user, maxTokens: 24000 });

  const pick = (k, fallback) => overrides[k] || str(r[k], 300) || fallback || '';
  const context = {
    title: pick('title', declared.title),
    author: pick('author', declared.author),
    publisher: pick('publisher', declared.publisher),
    publishedAt: pick('publishedAt', declared.published),
    genre: L.GENRES.includes(overrides.genre) ? overrides.genre : L.GENRES.includes(r.genre) ? r.genre : 'news',
    format: L.FORMATS.includes(overrides.format) ? overrides.format : L.FORMATS.includes(r.format) ? r.format : 'other',
    language: str(r.language, 20),
    topic: str(r.topic, 200),
    subjects: (r.subjects || []).map((s) => str(s, 80)).filter(Boolean).slice(0, 8),
    summary: str(r.summary, 1500),
    url: raw.url || '',
    host: (raw.meta && raw.meta.host) || '',
  };
  const claims = (r.claims || []).slice(0, 40).map((c, i) => {
    const span = locate(raw.text, c.quote);
    return {
      id: `c${i + 1}`,
      text: str(c.text, 500),
      quote: span ? raw.text.slice(span.start, span.end) : str(c.quote, 600),
      kind: c.kind,
      checkable: !!c.checkable,
      material: S.clamp(c.material, 1, 3),
      start: span ? span.start : null,
      end: span ? span.end : null,
    };
  });
  const upstreamRefs = (r.upstream || []).slice(0, 20).map((u) => ({
    title: str(u.title, 300),
    publisher: str(u.publisher, 120),
    author: str(u.author, 120),
    url: str(u.url, 1000),
    relation: L.RELATIONS.includes(u.relation) ? u.relation : 'reacts-to',
    evidence: u.evidence,
  }));
  return { update: { context, claims, upstreamRefs, title: context.title || str(raw.text, 80) }, next: 'blind' };
};

// ── blind ───────────────────────────────────────────────────────────────────

const blind = async (ctx) => {
  const { id, item } = ctx;
  const raw = await rawOf(id);
  const c = item.context || {};
  const names = namesToHide({ author: c.author, publisher: c.publisher, host: c.host });
  const masked = redact(raw.text, names);
  const user = `Genre: ${c.genre}. Format: ${c.format}.\nTitle: ${redact(c.title || '', names)}\n\n${contentBlock('content', {}, masked)}`;
  const r = await llm(ctx, 'blind', { system: P.BLIND_SYSTEM, schema: P.BLIND_SCHEMA, user, maxTokens: 32000 });
  const valid = (r.findings || []).filter((f) => techniques[f.techniqueId]);
  // Offsets in the masked text are offsets in the original (same-length mask).
  const { located, unlocated } = locateAll(masked, valid);
  const findings = located.map((f, i) => ({
    id: `f${i + 1}`,
    techniqueId: f.techniqueId,
    layer: techniques[f.techniqueId].layer,
    quote: raw.text.slice(f.start, f.end),
    start: f.start,
    end: f.end,
    explanation: str(f.explanation, 600),
    confidence: f.confidence,
  }));
  const unlocatedFindings = unlocated.slice(0, 30).map((f) => ({
    techniqueId: f.techniqueId,
    layer: techniques[f.techniqueId].layer,
    quote: str(f.quote, 600),
    explanation: str(f.explanation, 600),
    confidence: f.confidence,
  }));
  return { update: { findings, unlocatedFindings, blindMasked: names.filter((n) => n.length >= 3).length }, next: 'resolve' };
};

// ── resolve ─────────────────────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'how', 'why', 'what', 'who', 'its', 'has', 'have', 'not', 'but', 'you', 'your', 'our', 'new']);
const titleTokens = (s) => new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const firstAuthor = (author) => str(String(author || '').split(/,|;|\band\b|&/i)[0], 120);

const upsertSource = async (id, { name, kind, host }) => {
  const ref = col('sources').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ name, kind, hosts: host ? [host] : [], notes: '', affiliations: [], itemsCount: 0, profile: null, createdAt: now(), updatedAt: now() });
  } else if (host) {
    await ref.update({ hosts: FieldValue.arrayUnion(host), updatedAt: now() });
  }
};

/* Finds the stored item a reference points at: same normalized URL, else a
   close title match from a similar publisher. */
const matchRef = async (ref, selfId, recent) => {
  const key = normalizeUrl(ref.url);
  if (key) {
    const q = await col('items').where('urlKey', '==', key).limit(2).get();
    const hit = q.docs.find((d) => d.id !== selfId);
    if (hit) return hit.id;
  }
  if (ref.title) {
    const t = titleTokens(ref.title);
    const pub = String(ref.publisher || '').toLowerCase();
    let best = null;
    for (const r of recent) {
      if (r.id === selfId) continue;
      const score = jaccard(t, titleTokens(r.title));
      const pubOk = !pub || !r.publisher || r.publisher.toLowerCase().includes(pub) || pub.includes(r.publisher.toLowerCase());
      if (score >= 0.6 && pubOk && (!best || score > best.score)) best = { id: r.id, score };
    }
    if (best) return best.id;
  }
  return null;
};

const edgeIdFor = (fromId, toId, ref) => (fromId ? `${fromId}__${toId}` : `ref-${store.hash(normalizeUrl(ref.url) || ref.title || '')}__${toId}`);

const resolve = async (ctx) => {
  const { id, item } = ctx;
  const c = item.context || {};
  const input = item.input || {};
  const raw = await rawOf(id);

  // Sources: the person if there is a byline, and the outlet.
  const person = firstAuthor(c.author);
  const outlet = str(c.publisher, 120);
  const outletId = outlet ? `outlet-${store.slug(outlet)}` : '';
  const sourceId = person ? `person-${store.slug(person)}` : outletId || `outlet-${store.slug(c.host || 'unknown')}`;
  if (person) await upsertSource(sourceId, { name: person, kind: 'individual', host: c.host });
  if (outletId) await upsertSource(outletId, { name: outlet, kind: 'outlet', host: c.host });
  if (!person && !outletId) await upsertSource(sourceId, { name: c.host || 'Unknown source', kind: 'outlet', host: c.host });

  // Derivation edges.
  const recentSnap = await col('items').orderBy('createdAt', 'desc').limit(300).select('context.title', 'context.publisher').get();
  const recent = recentSnap.docs.map((d) => ({ id: d.id, title: d.get('context.title') || '', publisher: d.get('context.publisher') || '' }));
  const planned = new Map();
  const add = (e) => {
    const eid = edgeIdFor(e.from, id, e.ref || {});
    if (e.from === id || planned.has(eid)) return;
    planned.set(eid, e);
  };
  for (const up of (input.upstreamIds || []).slice(0, 10)) {
    if (typeof up !== 'string' || up === id) continue;
    if ((await col('items').doc(up).get()).exists) add({ from: up, relation: 'reacts-to', linkEvidence: 'user-linked', linkConfidence: 'high' });
  }
  for (const ref of item.upstreamRefs || []) {
    if (normalizeUrl(ref.url) && normalizeUrl(ref.url) === item.urlKey) continue;
    const from = await matchRef(ref, id, recent);
    const linkConfidence = ref.evidence === 'explicit-link' ? 'high' : 'medium';
    const existingUser = from && planned.get(edgeIdFor(from, id, {}));
    if (existingUser) {
      existingUser.relation = ref.relation; // the model knows how; the person knew that it does
      continue;
    }
    add({ from, ref, relation: ref.relation, linkEvidence: ref.evidence, linkConfidence });
  }
  const batch = store.db().batch();
  for (const [eid, e] of planned) {
    const ref = col('edges').doc(eid);
    const snap = await ref.get();
    if (snap.exists) continue; // a retry: never reset an analyzed edge
    batch.set(ref, {
      from: e.from || null,
      to: id,
      ref: e.ref || null,
      relation: e.relation,
      linkEvidence: e.linkEvidence,
      linkConfidence: e.linkConfidence,
      status: e.from ? 'pending' : 'missing',
      createdAt: now(),
    });
  }
  // A new capture fills in every "not yet ingested" edge that cites it: the
  // one it was submitted from, and any other whose reference has its URL.
  const fills = new Set();
  if (input.resolvesEdge && typeof input.resolvesEdge === 'string') {
    const snap = await col('edges').doc(input.resolvesEdge).get();
    if (snap.exists && snap.data().to !== id && !snap.data().from) fills.add(snap.id);
  }
  if (item.urlKey) {
    const miss = await col('edges').where('status', '==', 'missing').limit(1000).get();
    for (const d of miss.docs) {
      if (d.data().to !== id && normalizeUrl(d.data().ref && d.data().ref.url) === item.urlKey) fills.add(d.id);
    }
  }
  for (const eid of fills) {
    batch.update(col('edges').doc(eid), { from: id, status: 'waiting', resolvedAt: now() });
  }
  await batch.commit();

  // Narratives and claim matching (one model call).
  const narrSnap = await col('narratives').orderBy('lastSeen', 'desc').limit(80).get();
  const narratives = narrSnap.docs.map((d) => ({ id: d.id, name: d.get('name'), summary: d.get('summary') }));
  const claimCands = new Map();
  for (const e of planned.values()) {
    if (!e.from) continue;
    const up = await itemOf(e.from);
    for (const cl of (up && up.claims) || []) if (cl.claimId) claimCands.set(cl.claimId, cl.text);
  }
  const claimSnap = await col('claims').orderBy('lastSeen', 'desc').limit(120).get();
  for (const d of claimSnap.docs) if (!claimCands.has(d.id)) claimCands.set(d.id, d.get('text'));
  const claimList = [...claimCands].slice(0, 160);

  const itemClaims = item.claims || [];
  const user = [
    `Existing narratives:\n${narratives.map((n) => `- ${n.id}: ${n.name}. ${n.summary}`).join('\n') || '(none yet)'}`,
    `Existing claims:\n${claimList.map(([cid, text]) => `- ${cid}: ${text}`).join('\n') || '(none yet)'}`,
    `New content: "${c.title}" from ${person || outlet || c.host || 'an unknown source'} (${c.genre}, ${c.format}).\nSummary: ${c.summary}`,
    `Claims of the new content:\n${itemClaims.map((cl, i) => `${i}. ${cl.text}`).join('\n') || '(none)'}`,
    contentBlock('content', {}, raw.text),
  ].join('\n\n');
  const r = await llm(ctx, 'resolve', { system: P.RESOLVE_SYSTEM, schema: P.RESOLVE_SCHEMA, user, maxTokens: 16000 });

  const known = new Set(narratives.map((n) => n.id));
  const wb = store.db().batch();
  const filed = [];
  (r.narratives || []).slice(0, 3).forEach((n, k) => {
    const exists = n.existingId && known.has(n.existingId);
    const nid = exists ? n.existingId : `${id}-n${k + 1}`;
    if (filed.some((f) => f.id === nid)) return;
    const invariants = (n.invariants || []).filter((x) => S.INVARIANT_IDS.includes(x));
    if (exists) {
      wb.update(col('narratives').doc(nid), { lastSeen: now() });
    } else {
      wb.set(col('narratives').doc(nid), {
        name: str(n.name, 160),
        summary: str(n.summary, 800),
        impliedAction: str(n.impliedAction, 400),
        invariants,
        notes: '',
        itemCount: 0,
        createdFrom: id,
        createdAt: now(),
        lastSeen: now(),
      }, { merge: true });
    }
    filed.push({
      id: nid,
      name: exists ? narratives.find((x) => x.id === nid).name : str(n.name, 160),
      isNew: !exists,
      role: L.ROLES.includes(n.role) ? n.role : 'amplifier',
      hero: str(n.hero, 200),
      villain: str(n.villain, 200),
      victim: str(n.victim, 200),
      arbiter: str(n.arbiter, 200),
      invariants,
      impliedAction: str(n.impliedAction, 400),
    });
  });

  const links = new Map();
  for (const l of r.claimLinks || []) {
    if (Number.isInteger(l.claimIndex) && l.existingClaimId && claimCands.has(l.existingClaimId)) links.set(l.claimIndex, l.existingClaimId);
  }
  const claims = itemClaims.map((cl, i) => {
    const match = links.get(i);
    const cid = match || `${id}-${cl.id}`;
    if (match) {
      wb.update(col('claims').doc(cid), { itemIds: FieldValue.arrayUnion(id), variants: FieldValue.arrayUnion(cl.text), lastSeen: now() });
    } else {
      wb.set(col('claims').doc(cid), {
        text: cl.text,
        kind: cl.kind,
        checkable: cl.checkable,
        itemIds: [id],
        variants: [],
        firstItemId: id,
        verdict: 'unreviewed',
        verdictNote: '',
        createdAt: now(),
        lastSeen: now(),
      }, { merge: true });
    }
    return { ...cl, claimId: cid, matched: !!match };
  });
  await wb.commit();

  return {
    update: {
      sourceId,
      outletId,
      sourceName: person || outlet || c.host || '',
      narratives: filed,
      narrativeIds: filed.map((f) => f.id),
      claims,
      claimIds: claims.map((cl) => cl.claimId),
      edgeCount: planned.size,
    },
    next: 'relate',
  };
};

// ── relate ──────────────────────────────────────────────────────────────────

const spanIn = (text, quote) => {
  const s = quote ? locate(text, quote) : null;
  return s ? { start: s.start, end: s.end } : null;
};

const relate = async (ctx) => {
  const { id, item } = ctx;
  const edges = await col('edges').where('to', '==', id).get();
  let processed = 0;
  let more = false;
  let raw = null;
  for (const doc of edges.docs) {
    const e = doc.data();
    if (!e.from || e.status === 'unrelated') continue;
    if (e.status === 'done' && e.libraryVersion === L.VERSION) continue;
    if (processed >= MAX_EDGES_PER_PASS) {
      more = true;
      break;
    }
    const up = await itemOf(e.from);
    if (!up || up.status !== 'done') {
      if (e.status !== 'waiting') await doc.ref.update({ status: 'waiting' });
      continue;
    }
    raw = raw || (await rawOf(id));
    const src = await rawOf(e.from);
    const uc = up.context || {};
    const dc = item.context || {};
    const user = [
      contentBlock('source', { title: uc.title, publisher: uc.publisher, author: uc.author, published: uc.publishedAt }, src.text),
      contentBlock('derivative', { title: dc.title, publisher: dc.publisher, author: dc.author, published: dc.publishedAt }, raw.text),
      `The derivative is believed to ${e.relation} the source (link evidence: ${e.linkEvidence}).`,
    ].join('\n\n');
    const r = await llm(ctx, 'relate', { system: P.RELATE_SYSTEM, schema: P.RELATE_SCHEMA, user, maxTokens: 32000 });

    const carried = (r.carried || []).slice(0, 40).map((x) => ({
      derivativeQuote: str(x.derivativeQuote, 600),
      sourceQuote: str(x.sourceQuote, 600),
      status: x.status,
      transformationIds: (x.transformationIds || []).filter((t) => /^T\d+$/.test(t)),
      materiality: S.clamp(x.materiality, 1, 3),
      severity: x.status === 'distorted' ? S.clamp(x.severity, 1, 3) : 0,
      note: str(x.note, 500),
      dSpan: spanIn(raw.text, x.derivativeQuote),
      sSpan: spanIn(src.text, x.sourceQuote),
    }));
    const dropped = (r.dropped || []).slice(0, 30).map((x) => ({
      sourceQuote: str(x.sourceQuote, 600),
      kind: x.kind,
      materiality: S.clamp(x.materiality, 1, 3),
      note: str(x.note, 500),
      sSpan: spanIn(src.text, x.sourceQuote),
    }));
    const transformations = (r.transformations || []).slice(0, 40).map((x) => ({
      id: x.transformationId,
      derivativeQuote: str(x.derivativeQuote, 600),
      sourceQuote: str(x.sourceQuote, 600),
      severity: S.clamp(x.severity, 1, 3),
      confidence: x.confidence,
      note: str(x.note, 500),
      dSpan: spanIn(raw.text, x.derivativeQuote),
      sSpan: spanIn(src.text, x.sourceQuote),
    }));
    const unrelated = r.relationConfirmed === 'unrelated';
    await doc.ref.update({
      status: unrelated ? 'unrelated' : 'done',
      relation: unrelated ? e.relation : r.relationConfirmed,
      carried,
      dropped,
      transformations,
      summary: str(r.summary, 1500),
      fidelity: unrelated ? null : S.fidelity({ carried, dropped }),
      hop: (typeof up.hop === 'number' ? up.hop : 0) + 1,
      lagHours: S.lagHours(uc.publishedAt, dc.publishedAt),
      fromTitle: uc.title || '',
      fromSource: up.sourceName || '',
      toTitle: dc.title || '',
      toSource: item.sourceName || '',
      model: ctx.spend.model || null,
      libraryVersion: L.VERSION,
      analyzedAt: now(),
    });
    processed++;
  }
  if (more) return { update: {}, next: 'relate' };
  const skipNarrate = item.narrativeDoneAt && item.narrativeVersion === L.VERSION;
  return { update: {}, next: skipNarrate ? 'writeback' : 'narrate' };
};

// ── narrate ─────────────────────────────────────────────────────────────────

const narrate = async (ctx) => {
  const { id, item } = ctx;
  const raw = await rawOf(id);
  const c = item.context || {};
  const findings = item.findings || [];
  const packet = {
    title: c.title,
    author: c.author,
    outlet: c.publisher,
    published: c.publishedAt,
    genre: c.genre,
    format: c.format,
    topic: c.topic,
    url: c.url,
  };
  const user = [
    `Context packet:\n${JSON.stringify(packet)}`,
    `Narratives this content was filed under:\n${(item.narratives || []).map((n) => `- ${n.name} (role: ${n.role})`).join('\n') || '(none)'}`,
    `Layer 2 and 3 findings:\n${findings
      .map((f) => {
        const t = techniques[f.techniqueId];
        return `- ${f.id} [Layer ${f.layer}, ${t ? t.name : f.techniqueId}] "${f.quote}" ${f.explanation} Paired question: ${t ? t.question : ''}`;
      })
      .join('\n') || '(none)'}`,
    contentBlock('content', {}, raw.text),
  ].join('\n\n');
  const r = await llm(ctx, 'narrate', { system: P.NARRATE_SYSTEM, schema: P.NARRATE_SCHEMA, user, maxTokens: 24000 });

  const findingIds = new Set(findings.map((f) => f.id));
  const maneuvers = (r.maneuvers || []).slice(0, 20).map((m, i) => {
    const span = spanIn(raw.text, m.quote);
    return {
      id: `m${i + 1}`,
      maneuverId: m.maneuverId,
      quote: span ? raw.text.slice(span.start, span.end) : str(m.quote, 600),
      start: span ? span.start : null,
      end: span ? span.end : null,
      explanation: str(m.explanation, 600),
      confidence: m.confidence,
      supportingFindingIds: (m.supportingFindingIds || []).filter((x) => findingIds.has(x)),
    };
  });
  const known = [...findingIds, ...maneuvers.map((m) => m.id)];
  const pressure = S.pressureProfile(
    (r.invariants || []).map((x) => ({ id: x.invariantId, score: x.score, rationale: x.rationale, supportingFindingIds: x.supportingFindingIds })),
    known
  );
  const knownSet = new Set(known);
  const questions = (r.questions || [])
    .filter((q) => q.question && (!q.findingId || knownSet.has(q.findingId)))
    .slice(0, 8)
    .map((q) => ({ findingId: q.findingId || '', question: str(q.question, 400) }));
  const cast = r.cast || {};
  return {
    update: {
      layer4: {
        cast: { hero: str(cast.hero, 200), villain: str(cast.villain, 200), victim: str(cast.victim, 200), arbiter: str(cast.arbiter, 200) },
        inGroup: (r.inGroup || []).map((x) => str(x, 120)).slice(0, 6),
        outGroup: (r.outGroup || []).map((x) => str(x, 120)).slice(0, 6),
        maneuvers,
      },
      pressure,
      direction: { value: (r.direction && r.direction.value) || 'mixed', rationale: str(r.direction && r.direction.rationale, 600) },
      questions,
      narrativeDoneAt: now(),
      narrativeVersion: L.VERSION,
    },
    next: 'writeback',
  };
};

// ── writeback ───────────────────────────────────────────────────────────────

const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

const recomputeSource = async (sourceId, field) => {
  if (!sourceId) return;
  const snap = await col('items').where(field, '==', sourceId).limit(1000).get();
  const done = snap.docs.map((d) => d.data()).filter((d) => d.status === 'done');
  const profile = S.sourceProfile(
    done.map((d) => ({
      densityRaw: d.scores && d.scores.densityRaw,
      fidelity: d.scores && d.scores.fidelity,
      techniqueCounts: d.techniqueCounts,
      transformationCounts: d.transformationCounts,
      genre: d.context && d.context.genre,
      at: Date.parse((d.context && d.context.publishedAt) || '') || millis(d.createdAt),
    }))
  );
  const roles = {};
  for (const d of done) for (const n of d.narratives || []) roles[n.role] = (roles[n.role] || 0) + 1;
  profile.roles = roles;
  profile.usualRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  await col('sources').doc(sourceId).set({ profile, itemsCount: done.length, updatedAt: now() }, { merge: true });
};

const recomputeNarrative = async (nid) => {
  const snap = await col('items').where('narrativeIds', 'array-contains', nid).limit(1000).get();
  const done = snap.docs.map((d) => d.data()).filter((d) => d.status === 'done');
  const sources = new Set(done.map((d) => d.sourceId).filter(Boolean));
  const pressure = Object.fromEntries(S.INVARIANT_IDS.map((k) => [k, 0]));
  for (const d of done) for (const k of S.INVARIANT_IDS) pressure[k] += (d.pressure && d.pressure.scores && d.pressure.scores[k]) || 0;
  for (const k of S.INVARIANT_IDS) pressure[k] = done.length ? Math.round((pressure[k] / done.length) * 10) / 10 : 0;
  await col('narratives').doc(nid).set({ itemCount: done.length, sourceCount: sources.size, meanPressure: pressure, updatedAt: now() }, { merge: true });
};

const writeback = async ({ id, item }) => {
  const c = item.context || {};
  const findings = item.findings || [];
  const words = item.words || 0;
  const densityRaw = S.densityRaw(findings, words);

  const genreSnap = await col('items').where('context.genre', '==', c.genre).select('scores.densityRaw', 'status').limit(5000).get();
  const others = genreSnap.docs.filter((d) => d.id !== id && d.get('status') === 'done').map((d) => d.get('scores.densityRaw')).filter((x) => typeof x === 'number');
  const densityPct = S.percentile(densityRaw, others);

  const inEdges = (await col('edges').where('to', '==', id).get()).docs.map((d) => d.data());
  const analyzed = inEdges.filter((e) => e.status === 'done');
  const fidelity = mean(analyzed.map((e) => e.fidelity).filter((x) => typeof x === 'number'));
  const linked = inEdges.filter((e) => e.from);
  const hop = analyzed.length ? Math.min(...analyzed.map((e) => e.hop || 1)) : linked.length ? null : 0;
  const transformationCounts = {};
  for (const e of analyzed) for (const t of e.transformations || []) transformationCounts[t.id] = (transformationCounts[t.id] || 0) + 1;

  const update = {
    scores: {
      densityRaw,
      densityPct,
      densityBaseline: others.length,
      densityGenre: c.genre,
      fidelity,
      fidelityEdges: analyzed.length,
      pressurePeak: (item.pressure && item.pressure.peak) || 0,
      direction: (item.direction && item.direction.value) || null,
    },
    hop,
    techniqueCounts: S.counts(findings, 'techniqueId'),
    transformationCounts,
    libraryVersion: L.VERSION,
    doneAt: now(),
  };

  const after = async () => {
    await recomputeSource(item.sourceId, 'sourceId');
    if (item.outletId && item.outletId !== item.sourceId) await recomputeSource(item.outletId, 'outletId');
    for (const nid of item.narrativeIds || []) await recomputeNarrative(nid);
    await store.log({ event: 'scored', itemId: id, title: c.title || '', sourceId: item.sourceId || '', densityRaw, fidelity, libraryVersion: L.VERSION });
    // Downstream items that were waiting on this one get their relate pass.
    const out = await col('edges').where('from', '==', id).get();
    for (const d of out.docs) {
      const e = d.data();
      if (!['waiting', 'pending'].includes(e.status)) continue;
      const down = await itemOf(e.to);
      if (down && down.status === 'done') {
        await col('items').doc(e.to).update({ status: 'queued', stage: 'relate', requeuedBy: id, error: null });
      }
    }
  };
  return { update, next: null, after };
};

const STAGES = ['capture', 'extract', 'blind', 'resolve', 'relate', 'narrate', 'writeback'];
const HANDLERS = { capture, extract, blind, resolve, relate, narrate, writeback };

module.exports = { STAGES, HANDLERS, fetchPage, firstAuthor, titleTokens, jaccard, edgeIdFor };
