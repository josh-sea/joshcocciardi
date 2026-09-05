/* Render every lexicon word and every worked example, then decode the audio
 * back. Nothing here touches Web Audio, so `node test/roundtrip.mjs` exercises
 * the exact code the browser runs.
 */

import { WORDS, FAMILIES, isValidWord, CHECK, REGISTERS, URGENCIES, CODAS } from '../js/lexicon.js';
import { fromText, toRoman, toGloss, validate, EXAMPLES, MAX_WORDS } from '../js/utterance.js';
import { renderUtterance, frameTiming, SAMPLE_RATE } from '../js/synth.js';
import { decode } from '../js/decode.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; return; }
  fail += 1;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/* ── 1. The lexicon ───────────────────────────────────────────────────── */

check('lexicon size', WORDS.length === 192, `got ${WORDS.length}`);
check('family count', FAMILIES.length === 24, `got ${FAMILIES.length}`);
check('glosses unique', new Set(WORDS.map((w) => w.gloss)).size === 192);
check('addresses unique', new Set(WORDS.map((w) => w.address)).size === 192);
for (const w of WORDS) check(`parity ${w.gloss}`, isValidWord(w.slots), w.address);

/* The distance-2 guarantee in §2.1: flipping any one slot must leave the code. */
let aliases = 0;
for (const w of WORDS) {
  for (let i = 0; i < 4; i += 1) {
    for (let v = 0; v < 8; v += 1) {
      if (v === w.slots[i]) continue;
      const alt = w.slots.slice();
      alt[i] = v;
      if (isValidWord(alt)) aliases += 1;
    }
  }
}
check('single-slot errors never alias to a valid word', aliases === 0, `${aliases} aliases`);

/* ── 2. Notation ──────────────────────────────────────────────────────── */

for (const ex of EXAMPLES) {
  const u = fromText(ex.text);
  check(`parse "${ex.text}"`, !!u);
  if (!u) continue;
  const v = validate(u);
  check(`validate "${ex.text}"`, v.ok, v.errors.map((e) => e.message).join('; '));
  check(`round-trip notation "${ex.text}"`, fromText(toRoman(u)) && toGloss(fromText(toRoman(u))) === toGloss(u));
}

check('rejects unknown gloss', fromText('BANANA.') === null);
check('rejects bad romanization', fromText('do-do-do.') === null);
check('accepts raw address', toGloss(fromText('0000.')) === 'YES.');
check('parses register and urgency', (() => {
  const u = fromText('_!!DANGER FRONT.');
  return u.register === -1 && u.urgency === 2 && u.coda === 'fall';
})());

/* ── 3. The validator (§8.3) ──────────────────────────────────────────── */

const rejects = [
  ['too long', 'YES YES YES YES YES YES YES YES YES.'],
  ['ASK off the head', 'YOU ASK NAME?'],
  ['NOT at the end', 'I KNOW NOT.'],
  ['NUM without digits', 'NUM WATER.'],
  ['four repetitions', 'BAD BAD BAD BAD.'],
];
for (const [name, text] of rejects) {
  const u = fromText(text);
  check(`rejects ${name}`, u && !validate(u).ok, text);
}
check('accepts three repetitions', validate(fromText('BAD BAD BAD.')).ok);
// §5.4 is a warning, not a rejection: the spec's own "YOU GO OUT?" breaks it.
check('flags dangling relation without rejecting it', (() => {
  const v = validate(fromText('I GO TO.'));
  return v.ok && v.warnings.some((w) => w.code === 'relation');
})());
check('rejects bogus register', !validate({ words: ['YES'], register: 4, urgency: 0, coda: 'fall' }).ok);
check('rejects bogus coda', !validate({ words: ['YES'], register: 0, urgency: 0, coda: 'swoop' }).ok);

/* ── 4. Timing (§1.2, §4) ─────────────────────────────────────────────── */

const oneWord = renderUtterance(fromText('YES.'));
check('shortest utterance is 720 ms', Math.round(oneWord.duration * 1000) === 720,
  `${Math.round(oneWord.duration * 1000)} ms`);
check('word is 400 ms at U0', frameTiming(0).wordMs === 400);
for (const u of URGENCIES) {
  const r = renderUtterance({ words: ['YES', 'NO'], register: 0, urgency: u.value, coda: 'fall' });
  check(`timing at ${u.name}`, Math.round(r.duration * 1000) === frameTiming(u.value).utteranceMs(2));
}
let peak = 0;
for (const v of renderUtterance(fromText('^I SEE DOG.')).samples) peak = Math.max(peak, Math.abs(v));
check('no clipping', peak <= 1, `peak ${peak}`);

/* ── 5. Round trip: render then decode ────────────────────────────────── */

for (const w of WORDS) {
  const u = { words: [w.gloss], register: 0, urgency: 0, coda: 'fall' };
  const r = renderUtterance(u);
  const d = decode(r.samples, r.sampleRate);
  check(`decode ${w.gloss}`, d && d.words.length === 1 && d.words[0].gloss === w.gloss,
    d ? `${d.text} (${d.words[0] && d.words[0].roman})` : 'no signal');
}

for (const ex of EXAMPLES) {
  const u = fromText(ex.text);
  const r = renderUtterance(u);
  const d = decode(r.samples, r.sampleRate);
  const want = u.words.join(' ');
  check(`decode "${ex.text}"`, d && d.text === want, d ? `got "${d.text}"` : 'no signal');
  check(`register "${ex.text}"`, d && d.register === u.register, d ? `got ${d.register}` : '');
  check(`urgency "${ex.text}"`, d && d.urgency === u.urgency, d ? `got ${d.urgency}` : '');
  check(`coda "${ex.text}"`, d && d.coda === u.coda, d ? `got ${d.coda}` : '');
}

/* Every prosody combination on one sentence. */
for (const reg of REGISTERS) {
  for (const urg of URGENCIES) {
    for (const coda of CODAS) {
      const u = { words: ['DROID', 'READY'], register: reg.value, urgency: urg.value, coda: coda.value };
      const r = renderUtterance(u);
      const d = decode(r.samples, r.sampleRate);
      const label = `${reg.name}/${urg.name}/${coda.name}`;
      check(`prosody ${label}`, d && d.text === 'DROID READY' && d.register === reg.value
        && d.urgency === urg.value && d.coda === coda.value,
        d ? `${d.text} r${d.register} u${d.urgency} ${d.coda}` : 'no signal');
    }
  }
}

/* An eight-word utterance, the hard cap. */
{
  const u = fromText('I SEE DOG AND CAT NEAR HOME NOW.');
  check('eight words parse', u && u.words.length === 8);
  const r = renderUtterance(u);
  const d = decode(r.samples, r.sampleRate);
  check('decode eight words', d && d.text === u.words.join(' '), d ? d.text : 'no signal');
}

/* Randomised base frequency: the ear-training mode must still decode when the
 * decoder is told the register, since transposition is not part of the code. */
{
  const u = fromText('^HELLO FRIEND.');
  const r = renderUtterance(u, { transpose: 1.0 });
  const d = decode(r.samples, r.sampleRate);
  check('decodes at nominal pitch', d && d.text === 'HELLO FRIEND', d ? d.text : 'no signal');
}

/* Noise tolerance: a parity failure must surface as AGAIN, never as a
 * different valid word (§2.1). */
{
  const u = fromText('DANGER FRONT.');
  const r = renderUtterance(u);
  const noisy = Float32Array.from(r.samples, (v) => v + (Math.random() - 0.5) * 0.05);
  const d = decode(noisy, r.sampleRate);
  check('survives light noise', d && d.text === 'DANGER FRONT', d ? d.text : 'no signal');
}
{
  // Corrupt one slot outright and confirm the word fails parity rather than
  // decoding to something else.
  const u = { words: ['GOOD'], register: 0, urgency: 0, coda: 'fall' };
  const r = renderUtterance(u);
  const t = frameTiming(0);
  const sr = r.sampleRate;
  const start = Math.round((sr * t.preambleMs) / 1000) + Math.round((sr * (t.slotMs + t.gapMs)) / 1000);
  const len = Math.round((sr * t.slotMs) / 1000);
  const bad = Float32Array.from(r.samples);
  for (let i = 0; i < len; i += 1) {
    bad[start + i] = 0.32 * Math.sin((2 * Math.PI * 1174.66 * i) / sr);
  }
  const d = decode(bad, sr);
  check('single-slot corruption fails loudly', d && d.text === 'AGAIN', d ? d.text : 'no signal');
}

/* ── Report ───────────────────────────────────────────────────────────── */

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures.slice(0, 40)) console.log('  ✗ ' + f);
  if (failures.length > 40) console.log(`  ...and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('All Solra round-trip checks passed.\n');
