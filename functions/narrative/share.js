// ---------------------------------------------------------------------------
// Narrative Lab: what a shared link may show, and what a viewer may submit.
//
// A share is a random token with a scope (one item, one cascade, or the
// whole lab). The public page never reads Firestore; it asks nlPublic, which
// builds a snapshot through the functions below. They are an allowlist: a
// field reaches a viewer only if it is copied here.
//
// Never shared: the original texts (republishing them is a copyright
// problem; viewers get short excerpts and a link to the original), notes,
// costs, pipeline internals, claim verdicts, and source profiles.
//
// Pure functions, no dependencies.
// ---------------------------------------------------------------------------

const SCOPES = ['item', 'cascade', 'lab'];
const EXCERPT_CHARS = 300;
const LAB_MAX_ITEMS = 400;
const CASCADE_MAX_DEPTH = 8;

const excerpt = (s, n = EXCERPT_CHARS) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x, n = 300) => excerpt(x, n);

const shareState = (share, now = Date.now()) => {
  if (!share) return 'missing';
  if (share.revoked) return 'revoked';
  const exp = share.expiresAt && (typeof share.expiresAt.toMillis === 'function' ? share.expiresAt.toMillis() : Date.parse(share.expiresAt));
  if (exp && exp < now) return 'expired';
  if (!SCOPES.includes(share.scope)) return 'missing';
  return 'active';
};

/* Ids in a cascade: the root and everything derived from it, following
   analyzed or pending edges (not ones judged unrelated). */
const cascadeIds = (rootId, edges, maxDepth = CASCADE_MAX_DEPTH) => {
  const byFrom = {};
  for (const e of edges || []) if (e.from && e.status !== 'unrelated') (byFrom[e.from] = byFrom[e.from] || []).push(e.to);
  const seen = new Set([rootId]);
  let frontier = [rootId];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const id of frontier) for (const to of byFrom[id] || []) if (!seen.has(to)) {
      seen.add(to);
      next.push(to);
    }
    frontier = next;
  }
  return [...seen];
};

/* The root of the cascade an item belongs to: follow upstream edges to an
   item with no stored upstream. Picks the earliest path when there are
   several; stops on a cycle. */
const cascadeRoot = (itemId, edges) => {
  const up = {};
  for (const e of edges || []) if (e.from && e.status !== 'unrelated') (up[e.to] = up[e.to] || []).push(e.from);
  let cur = itemId;
  const seen = new Set([cur]);
  while (up[cur] && up[cur].length) {
    const nxt = up[cur].find((x) => !seen.has(x));
    if (!nxt) break;
    seen.add(nxt);
    cur = nxt;
  }
  return cur;
};

const publicFinding = (f) => ({
  id: f.id,
  layer: f.layer,
  techniqueId: f.techniqueId || null,
  maneuverId: f.maneuverId || null,
  quote: excerpt(f.quote),
  explanation: str(f.explanation, 400),
  confidence: f.confidence,
});

const publicItem = (it) => {
  const c = it.context || {};
  const s = it.scores || {};
  return {
    id: it.id,
    title: str(c.title || it.title, 200),
    source: str(it.sourceName || c.author, 120),
    outlet: str(c.publisher, 120),
    publishedAt: str(c.publishedAt, 40),
    genre: c.genre || null,
    format: c.format || null,
    url: /^https?:\/\//.test(c.url || '') ? c.url : null,
    summary: str(c.summary, 600),
    topic: str(c.topic, 160),
    words: num(it.words),
    hop: num(it.hop),
    scores: {
      densityRaw: num(s.densityRaw),
      densityPct: num(s.densityPct),
      densityBaseline: num(s.densityBaseline),
      densityGenre: s.densityGenre || null,
      fidelity: num(s.fidelity),
      direction: s.direction || null,
      pressurePeak: num(s.pressurePeak),
    },
    pressure: it.pressure ? { scores: it.pressure.scores || {}, capped: it.pressure.capped || [] } : null,
    direction: it.direction ? { value: it.direction.value, rationale: str(it.direction.rationale, 400) } : null,
    findings: (it.findings || []).map(publicFinding),
    maneuvers: ((it.layer4 && it.layer4.maneuvers) || []).map((m) => publicFinding({ ...m, layer: 4 })),
    cast: (it.layer4 && it.layer4.cast) || null,
    inGroup: (it.layer4 && it.layer4.inGroup) || [],
    outGroup: (it.layer4 && it.layer4.outGroup) || [],
    questions: (it.questions || []).map((q) => ({ findingId: q.findingId || '', question: str(q.question, 300) })),
    narratives: (it.narratives || []).map((n) => ({ id: n.id, name: str(n.name, 160), role: n.role })),
    claims: (it.claims || []).map((cl) => ({ text: str(cl.text, 300), kind: cl.kind })),
    libraryVersion: it.libraryVersion || null,
  };
};

const publicEdge = (e) => ({
  id: e.id,
  from: e.from,
  to: e.to,
  relation: e.relation,
  status: e.status,
  fidelity: num(e.fidelity),
  hop: num(e.hop),
  lagHours: num(e.lagHours),
  summary: str(e.summary, 600),
  transformations: (e.transformations || []).map((t) => ({ id: t.id, severity: t.severity, derivativeQuote: excerpt(t.derivativeQuote), sourceQuote: excerpt(t.sourceQuote), note: str(t.note, 300) })),
  carried: (e.carried || []).map((x) => ({ status: x.status, transformationIds: x.transformationIds || [], derivativeQuote: excerpt(x.derivativeQuote), sourceQuote: excerpt(x.sourceQuote), note: str(x.note, 300) })),
  dropped: (e.dropped || []).map((x) => ({ kind: x.kind, sourceQuote: excerpt(x.sourceQuote), note: str(x.note, 300) })),
});

/* The whole payload for one share. `items` and `edges` are what the caller
   loaded (with ids); this decides which of them the scope covers. */
const buildSnapshot = ({ share, items, edges, narratives = [], library }) => {
  const done = items.filter((it) => it.status === 'done' && !it.archived);
  const byId = Object.fromEntries(done.map((it) => [it.id, it]));
  let ids;
  if (share.scope === 'item') {
    ids = byId[share.targetId] ? [share.targetId] : [];
    // Neighbors appear as titles only, so the item's edges can be read.
    for (const e of edges) {
      if (e.to === share.targetId && e.from && byId[e.from]) ids.push(e.from);
      if (e.from === share.targetId && byId[e.to]) ids.push(e.to);
    }
  } else if (share.scope === 'cascade') {
    ids = byId[share.targetId] ? cascadeIds(share.targetId, edges).filter((id) => byId[id]) : [];
  } else {
    ids = done.slice(0, LAB_MAX_ITEMS).map((it) => it.id);
  }
  const set = new Set(ids);
  const full = share.scope === 'item' ? new Set([share.targetId]) : set;
  const outItems = [...set].map((id) => {
    const p = publicItem(byId[id]);
    if (!full.has(id)) return { id: p.id, title: p.title, source: p.source, outlet: p.outlet, publishedAt: p.publishedAt, url: p.url, hop: p.hop, scores: { fidelity: p.scores.fidelity }, neighborOnly: true };
    return p;
  });
  const outEdges = edges.filter((e) => e.from && set.has(e.from) && set.has(e.to) && e.status !== 'unrelated').map(publicEdge);
  const usedNarr = new Set(outItems.flatMap((it) => (it.narratives || []).map((n) => n.id)));
  return {
    share: {
      label: str(share.label, 160),
      scope: share.scope,
      targetId: share.scope === 'lab' ? null : share.targetId,
      allowSuggestions: !!share.allowSuggestions,
    },
    items: outItems,
    edges: outEdges,
    narratives: narratives.filter((n) => usedNarr.has(n.id)).map((n) => ({ id: n.id, name: str(n.name, 160), summary: str(n.summary, 600), itemCount: num(n.itemCount) })),
    library: library
      ? {
          version: library.version,
          techniques: library.techniques.map((t) => ({ id: t.id, layer: t.layer, name: t.name, definition: t.definition, question: t.question })),
          maneuvers: library.maneuvers.map((m) => ({ id: m.id, name: m.name, definition: m.definition })),
          invariants: library.invariants.map((i) => ({ id: i.id, name: i.name, definition: i.definition })),
          transformations: library.transformations.map((t) => ({ id: t.id, name: t.name, direction: t.direction, definition: t.definition })),
        }
      : null,
  };
};

// ── Suggestions from viewers ────────────────────────────────────────────────

const SUGGEST_LIMITS = { text: 100000, title: 300, author: 160, publisher: 160, note: 1500, name: 80, contact: 160, url: 2000 };
const HOURLY_SUGGESTIONS_PER_SHARE = 10;
const MAX_PENDING = 300;

/* Cleans one submission. Returns { ok: true, value } or { ok: false, error }.
   `website` is a honeypot field the form hides from people. */
const validateSuggestion = (body) => {
  const b = body && typeof body === 'object' ? body : {};
  if (b.website) return { ok: false, error: 'spam' };
  const clean = (k) => (typeof b[k] === 'string' ? b[k].replace(/\r\n?/g, '\n').trim() : '');
  const v = {};
  for (const k of Object.keys(SUGGEST_LIMITS)) v[k] = clean(k);
  for (const [k, max] of Object.entries(SUGGEST_LIMITS)) {
    if (v[k].length > max) return { ok: false, error: `${k === 'text' ? 'The pasted text' : `The ${k}`} is too long (limit ${max.toLocaleString('en-US')} characters).` };
  }
  if (v.url && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(v.url)) return { ok: false, error: 'The link should start with http:// or https://.' };
  if (!v.url && v.text.length < 40) return { ok: false, error: 'Add a link, or paste at least a few sentences of text.' };
  return { ok: true, value: v };
};

const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);

module.exports = {
  SCOPES,
  EXCERPT_CHARS,
  LAB_MAX_ITEMS,
  SUGGEST_LIMITS,
  HOURLY_SUGGESTIONS_PER_SHARE,
  MAX_PENDING,
  excerpt,
  shareState,
  cascadeIds,
  cascadeRoot,
  publicItem,
  publicEdge,
  buildSnapshot,
  validateSuggestion,
  hourKey,
};
