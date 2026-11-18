// Pure tests for Narrative Lab: page capture, the blind-pass mask, quote
// location, the four scores, the library's internal consistency, and that
// every output schema stays inside the structured-outputs subset. No
// dependencies, no emulator, no API key:
//
//   node functions/test/narrative-pure.test.mjs

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractPage, normalizeUrl, decodeEntities } = require('../narrative/html.js');
const { redact, namesToHide, locate, locateAll, wordCount, MASK } = require('../narrative/spans.js');
const S = require('../narrative/scoring.js');
const L = require('../narrative/library.js');
const P = require('../narrative/prompts.js');
const SH = require('../narrative/share.js');

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const ok = (label, cond) => eq(label, !!cond, true);

// ── capture ──
console.log('capture:');
const para = 'The committee found that the policy reduced wait times in three of the five districts it studied, though the authors cautioned the sample was small. ';
const page = `<!doctype html><html><head>
<title>Fallback title | Example Times</title>
<meta property="og:title" content="Wait times fell in three districts">
<meta property="og:site_name" content="Example Times">
<meta name="author" content="Meta Author">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"NewsArticle","headline":"LD headline","author":[{"@type":"Person","name":"Dana Reyes"},{"@type":"Person","name":"Sam Ortiz"}],"datePublished":"2026-11-10T09:00:00Z","publisher":{"@type":"Organization","name":"The Example Times"}}]}</script>
<script>var tracking = "do not keep me";</script>
</head><body>
<nav><a href="/sections">Sections</a> Menu Menu Menu</nav>
<article><h1>Wait times fell</h1><p>${para.repeat(4)}</p>
<p>See the <a href="https://data.example.gov/report-2026.pdf?utm_source=x">full district report</a> and <a href="/about">About</a>.</p>
<p>Quotes &ldquo;matter&rdquo; &amp; so do entities&#8212;and &#x2019;this&#x2019;.</p></article>
<footer>Copyright footer text</footer></body></html>`;
const got = extractPage(page, 'https://www.example.com/2026/11/wait-times');
eq('JSON-LD headline wins', got.meta.title, 'LD headline');
eq('JSON-LD authors joined', got.meta.author, 'Dana Reyes, Sam Ortiz');
eq('JSON-LD publisher', got.meta.publisher, 'The Example Times');
eq('published date', got.meta.published, '2026-11-10T09:00:00Z');
eq('host without www', got.meta.host, 'example.com');
ok('readable', got.readable);
ok('script text dropped', !got.text.includes('do not keep me'));
ok('nav dropped', !got.text.includes('Menu Menu'));
ok('footer dropped', !got.text.includes('Copyright footer'));
ok('entities decoded', got.text.includes('“matter” & so do entities—and ’this’'));
eq('outbound link kept, same-site short link dropped', got.links.map((l) => l.href), ['https://data.example.gov/report-2026.pdf?utm_source=x']);
eq('short page is not readable', extractPage('<html><body><p>Subscribe to read.</p></body></html>', 'https://x.com/a').readable, false);
eq('meta fallback when no JSON-LD', extractPage('<head><meta property="og:site_name" content="Site"><meta name="author" content="A. Writer"></head><body><p>x</p></body>').meta, { title: '', author: 'A. Writer', publisher: 'Site', published: '', description: '', host: '' });
eq('decodeEntities leaves unknown names', decodeEntities('&bogus; &amp;'), '&bogus; &');

console.log('urls:');
eq('normalize strips scheme, www, tracking, slash', normalizeUrl('https://www.Example.com/a/b/?utm_source=x&id=4#top'), 'example.com/a/b?id=4');
eq('normalize same story two ways', normalizeUrl('http://example.com/a/b'), normalizeUrl('https://www.example.com/a/b/?fbclid=1'));
eq('normalize junk', normalizeUrl('not a url'), '');

// ── spans ──
console.log('blind mask:');
const text = 'By Dana Reyes, The Example Times. Dana Reyes reports that New York saw gains.';
const names = namesToHide({ author: 'Dana Reyes', publisher: 'The Example Times', host: 'example.com' });
const masked = redact(text, names);
eq('mask keeps length', masked.length, text.length);
ok('author masked', !/Dana|Reyes/.test(masked));
ok('outlet masked', !/Example/.test(masked));
ok('unrelated words kept', masked.includes('New York saw gains'));
ok('mask uses block characters', masked.includes(MASK.repeat(4)));
eq('short names are not masked', redact('an AP story', ['AP']), 'an AP story');

console.log('locate:');
const body = 'He said it was “the worst  decision—ever made.” Then he left. Then he left again.';
eq('exact', locate(body, 'Then he left'), { start: body.indexOf('Then he left'), end: body.indexOf('Then he left') + 12 });
const loose = locate(body, '"the worst decision-ever made."');
ok('straight quotes, collapsed space, plain dash still found', loose && body.slice(loose.start, loose.end).startsWith('the worst'));
eq('case-insensitive', !!locate(body, 'THEN HE LEFT AGAIN'), true);
eq('paraphrase is not found', locate(body, 'he walked out'), null);
eq('too short', locate(body, 'He'), null);
const all = locateAll(body, [{ quote: 'Then he left' }, { quote: 'Then he left' }, { quote: 'invented passage' }]);
eq('repeated quote gets its own span', all.located.map((x) => x.start), [body.indexOf('Then he left'), body.lastIndexOf('Then he left')]);
eq('unlocated kept apart', all.unlocated.length, 1);
const mk = redact(text, names);
const span = locate(mk, `${MASK.repeat(4)} ${MASK.repeat(5)} reports that`);
eq('a quote with masked names maps back to the original', span && text.slice(span.start, span.end), 'Dana Reyes reports that');
eq('wordCount', wordCount("It's a well-known fact: 3 of 5 agree."), 8);

// ── scoring ──
console.log('density:');
const fs = [
  { layer: 2, confidence: 'high' },
  { layer: 3, confidence: 'medium' },
  { layer: 3, confidence: 'low' },
  { layer: 4, confidence: 'high' },
];
eq('weighted per 1,000 words, Layers 2 and 3 only', S.densityRaw(fs, 1000), 1.9);
eq('short text has no rate', S.densityRaw(fs, 40), null);
eq('no findings', S.densityRaw([], 500), 0);
const base = Array.from({ length: 200 }, (_, i) => i / 10);
eq('percentile uncalibrated below baseline', S.percentile(5, base.slice(0, 199)), null);
eq('percentile mid', S.percentile(10, base), 50);
eq('percentile top', S.percentile(99, base), 100);

console.log('fidelity:');
eq('all faithful', S.fidelity({ carried: [{ status: 'faithful', materiality: 2 }] }), 100);
eq('nothing to compare', S.fidelity({}), null);
eq('mixed', S.fidelity({
  carried: [
    { status: 'faithful', materiality: 3 },
    { status: 'distorted', materiality: 3, severity: 3 },
    { status: 'distorted', materiality: 3, severity: 1 },
    { status: 'unsupported', materiality: 1 },
  ],
  dropped: [{ materiality: 2 }],
}), Math.round(((3 + 0 + 2) / 12) * 100));
eq('severity and materiality are clamped', S.fidelity({ carried: [{ status: 'distorted', materiality: 9, severity: -4 }] }), 67);

console.log('pressure:');
const pp = S.pressureProfile(
  [
    { id: 'epistemic', score: 3, supportingFindingIds: ['f1', 'f9'] },
    { id: 'social', score: 2, supportingFindingIds: [] },
    { id: 'teleological', score: 7, supportingFindingIds: ['m1'] },
    { id: 'made-up', score: 3 },
  ],
  ['f1', 'f2', 'm1']
);
eq('supported score stands, unknown ids dropped', [pp.scores.epistemic, pp.support.epistemic], [3, ['f1']]);
eq('unsupported score capped at 1', [pp.scores.social, pp.capped], [1, ['social']]);
eq('score clamped to 3', pp.scores.teleological, 3);
eq('unknown invariant ignored', Object.keys(pp.scores), S.INVARIANT_IDS);
eq('peak', pp.peak, 3);

console.log('profile:');
const items = Array.from({ length: 21 }, (_, i) => ({
  densityRaw: i,
  fidelity: i % 2 ? 80 : null,
  techniqueCounts: { 'loaded-language': 2, 'straw-man': i % 3 === 0 ? 1 : 0 },
  transformationCounts: { T2: 1 },
  genre: i < 15 ? 'opinion' : 'news',
  at: 1000 + i,
}));
const prof = S.sourceProfile(items);
eq('shown from 20 items', [prof.items, prof.shown, S.sourceProfile(items.slice(0, 19)).shown], [21, true, false]);
eq('median density', prof.densityMedian, 10);
eq('fidelity median over scored items only', [prof.fidelityMedian, prof.fidelityItems], [80, 10]);
eq('top technique', prof.topTechniques[0], { id: 'loaded-language', count: 42 });
eq('genres', prof.genres, { opinion: 15, news: 6 });
eq('first and last seen', [prof.firstSeen, prof.lastSeen], [1000, 1020]);
eq('hop of a primary', S.hopOf([]), 0);
eq('hop is nearest upstream plus one', S.hopOf([2, 0, 1]), 1);
eq('lag hours', S.lagHours('2026-11-10T00:00:00Z', '2026-11-11T12:00:00Z'), 36);
eq('lag unknown', S.lagHours('', '2026-11-11'), null);

// ── library ──
console.log('library:');
const ids = (xs) => xs.map((x) => x.id);
const unique = (xs) => new Set(xs).size === xs.length;
ok('technique ids unique', unique(ids(L.TECHNIQUES)));
ok('every technique is Layer 2 or 3', L.TECHNIQUES.every((t) => t.layer === 2 || t.layer === 3));
ok('every technique has a definition and a question', L.TECHNIQUES.every((t) => t.definition && t.question && t.name));
ok('transformations T1 to T16 in order', ids(L.TRANSFORMATIONS).join() === Array.from({ length: 16 }, (_, i) => `T${i + 1}`).join());
eq('sixteen BEND maneuvers, eight of each kind', [L.MANEUVERS.length, L.MANEUVERS.filter((m) => m.kind === 'content').length], [16, 8]);
eq('invariants match the scoring list', ids(L.INVARIANTS), S.INVARIANT_IDS);
ok('version is semver', /^\d+\.\d+\.\d+$/.test(L.VERSION));

// ── schemas ──
console.log('schemas:');
const problems = [];
const walk = (node, path) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') {
    if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties`);
    const keys = Object.keys(node.properties || {});
    if (JSON.stringify([...(node.required || [])].sort()) !== JSON.stringify([...keys].sort())) problems.push(`${path}: required`);
    for (const k of keys) walk(node.properties[k], `${path}.${k}`);
  }
  if (node.type === 'array') walk(node.items, `${path}[]`);
  for (const banned of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'multipleOf']) if (banned in node) problems.push(`${path}: ${banned}`);
  if (node.enum && !node.enum.length) problems.push(`${path}: empty enum`);
};
for (const name of ['EXTRACT', 'BLIND', 'RESOLVE', 'RELATE', 'NARRATE']) walk(P[`${name}_SCHEMA`], name);
eq('every schema is in the structured-outputs subset', problems, []);
ok('blind enum lists every technique', P.BLIND_SCHEMA.properties.findings.items.properties.techniqueId.enum.length === L.TECHNIQUES.length);
ok('system prompts carry no per-item content', !/\$\{|undefined/.test(P.BLIND_SYSTEM + P.RELATE_SYSTEM + P.NARRATE_SYSTEM + P.EXTRACT_SYSTEM + P.RESOLVE_SYSTEM));

// ── share links ──
console.log('share links:');
eq('active', SH.shareState({ scope: 'cascade', revoked: false }), 'active');
eq('revoked', SH.shareState({ scope: 'cascade', revoked: true }), 'revoked');
eq('expired', SH.shareState({ scope: 'item', expiresAt: '2026-01-01T00:00:00Z' }, Date.parse('2026-02-01')), 'expired');
eq('not expired yet', SH.shareState({ scope: 'item', expiresAt: '2026-03-01T00:00:00Z' }, Date.parse('2026-02-01')), 'active');
eq('missing doc', SH.shareState(null), 'missing');
eq('bad scope', SH.shareState({ scope: 'everything' }), 'missing');
const E = [
  { id: 'e1', from: 'P', to: 'A', status: 'done' },
  { id: 'e2', from: 'A', to: 'B', status: 'done' },
  { id: 'e3', from: 'P', to: 'U', status: 'unrelated' },
  { id: 'e4', from: 'B', to: 'P', status: 'done' },
  { id: 'e5', from: null, to: 'A', status: 'missing' },
  { id: 'e6', from: 'Q', to: 'R', status: 'done' },
];
eq('cascade follows derivations, skips unrelated, stops on a cycle', SH.cascadeIds('P', E).sort(), ['A', 'B', 'P']);
eq('cascade root from a leaf', SH.cascadeRoot('R', E), 'Q');
eq('cascade root survives a cycle', ['P', 'A', 'B'].includes(SH.cascadeRoot('B', E)), true);

const priv = (id, extra = {}) => ({
  id,
  status: 'done',
  context: { title: `Title ${id}`, author: 'Dana', publisher: 'Example', url: 'https://ex.com/a', summary: 's', publishedAt: '2026-11-10' },
  sourceName: 'Dana',
  notes: 'PRIVATE NOTE',
  cost: 0.42,
  steps: { blind: { cost: 0.1 } },
  input: { text: 'FULL ORIGINAL TEXT' },
  claims: [{ text: 'claim', kind: 'fact', claimId: 'c1', quote: 'q', start: 1, end: 2 }],
  findings: [{ id: 'f1', layer: 3, techniqueId: 'loaded-language', quote: 'x'.repeat(900), explanation: 'e', confidence: 'high', start: 3, end: 903 }],
  scores: { densityRaw: 4.2, fidelity: 60 },
  ...extra,
});
const shared = [priv('P'), priv('A'), priv('B'), priv('U'), priv('Q'), priv('R'), priv('X', { archived: true }), priv('Y', { status: 'failed' })];
const snapC = SH.buildSnapshot({ share: { scope: "cascade", targetId: "P", label: "L", allowSuggestions: true, views: 9 }, items: shared, edges: E, narratives: [], library: L.LIBRARY });
eq('cascade snapshot covers the cascade only', snapC.items.map((x) => x.id).sort(), ['A', 'B', 'P']);
eq('edges inside the cascade only, unrelated dropped', snapC.edges.map((x) => x.id).sort(), ['e1', 'e2', 'e4']);
const blob = JSON.stringify(snapC);
ok('no notes leak', !blob.includes('PRIVATE NOTE'));
ok('no original text leaks', !blob.includes('FULL ORIGINAL TEXT'));
ok('no cost or pipeline steps leak', !/"cost"|"steps"|"input"/.test(blob));
ok('no claim ids or offsets leak', !/"claimId"|"start"|"end"/.test(blob));
ok('no share counters leak', !/"views"/.test(blob));
eq('quotes are cut to excerpts', snapC.items[0].findings[0].quote.length, SH.EXCERPT_CHARS);
ok('library without internals', snapC.library.techniques.every((t) => Object.keys(t).join() === 'id,layer,name,definition,question'));
const snapI = SH.buildSnapshot({ share: { scope: "item", targetId: "A" }, items: shared, edges: E });
eq('item snapshot: the item in full, neighbors as titles', snapI.items.map((x) => [x.id, !!x.neighborOnly]).sort(), [['A', false], ['B', true], ['P', true]]);
ok('neighbors carry no findings', snapI.items.filter((x) => x.neighborOnly).every((x) => !('findings' in x)));
const snapL = SH.buildSnapshot({ share: { scope: "lab" }, items: shared, edges: E });
eq('lab snapshot skips archived and unfinished items', snapL.items.map((x) => x.id).sort(), ['A', 'B', 'P', 'Q', 'R', 'U']);
eq('lab snapshot has no target', snapL.share.targetId, null);
eq('unknown target gives an empty snapshot', SH.buildSnapshot({ share: { scope: "cascade", targetId: "nope" }, items: shared, edges: E }).items.length, 0);
ok('non-http url dropped', SH.publicItem(priv('Z', { context: { url: 'javascript:alert(1)' } })).url === null);

console.log('suggestions:');
eq('a link is enough', SH.validateSuggestion({ url: 'https://example.com/story' }).ok, true);
eq('short text alone is not', SH.validateSuggestion({ text: 'too short' }).ok, false);
eq('a long paste is', SH.validateSuggestion({ text: 'word '.repeat(20) }).ok, true);
eq('bad link', SH.validateSuggestion({ url: 'ftp://x' }).error, 'The link should start with http:// or https://.');
eq('honeypot', SH.validateSuggestion({ url: 'https://example.com/a', website: 'http://spam' }).error, 'spam');
ok('too long', /too long/.test(SH.validateSuggestion({ url: 'https://example.com/a', note: 'n'.repeat(2000) }).error));
eq('fields trimmed, unknown fields dropped', SH.validateSuggestion({ url: ' https://example.com/a ', admin: true, title: '  T  ' }).value, { text: '', title: 'T', author: '', publisher: '', note: '', name: '', contact: '', url: 'https://example.com/a' });
eq('non-object body', SH.validateSuggestion('nope').ok, false);
eq('hour key', SH.hourKey(new Date('2026-11-18T14:35:00Z')), '2026-11-18T14');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
