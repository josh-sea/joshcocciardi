// ---------------------------------------------------------------------------
// Evidence spans: hiding the author for the blind pass, and finding a quote
// the model returned in the original text.
//
// The model is asked to quote the text exactly. It mostly does, but it may
// straighten curly quotes, collapse whitespace, or change case. locate()
// tolerates those differences and nothing else: a quote that cannot be found
// is a finding without evidence, and the pipeline keeps it out of the scores.
// ---------------------------------------------------------------------------

const MASK = '█'; // full block

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Replaces every occurrence of each name with a same-length mask, so offsets in
   the redacted text are offsets in the original. Names shorter than three
   characters are skipped (they would mask ordinary words). Longer names go
   first so "The New York Times" masks before "New York". */
const redact = (text, names) => {
  const list = [...new Set((names || []).map((n) => String(n || '').trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  let out = String(text || '');
  for (const name of list) {
    out = out.replace(new RegExp(escapeRe(name), 'gi'), (m) => m.replace(/[^\s]/g, MASK));
  }
  return out;
};

/* Names worth hiding for one item: the author, the outlet, each part of a
   multi-author byline, and the site's host. */
const namesToHide = ({ author, publisher, host } = {}) => {
  const out = [];
  if (author) {
    out.push(author);
    for (const part of String(author).split(/,|\band\b|&/i)) out.push(part.trim());
  }
  if (publisher) out.push(publisher, String(publisher).replace(/^the\s+/i, ''));
  if (host) out.push(host, String(host).split('.')[0]);
  return out;
};

const FOLD = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '−': '-', '…': '...', ' ': ' ',
};

/* Folded text plus, for each folded character, the index it came from. */
const fold = (s) => {
  const chars = [];
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (FOLD[c] !== undefined) c = FOLD[c];
    if (/\s/.test(c)) {
      if (lastSpace) continue;
      chars.push(' ');
      map.push(i);
      lastSpace = true;
      continue;
    }
    for (const ch of c.toLowerCase()) {
      chars.push(ch);
      map.push(i);
    }
    lastSpace = false;
  }
  return { folded: chars.join(''), map };
};

/* { start, end } of the quote in text (end exclusive), or null. Tries an exact
   match first, then the folded match. A quote that occurs more than once
   resolves to its first occurrence at or after `from`. */
const locate = (text, quote, from = 0) => {
  const t = String(text || '');
  const q = String(quote || '').trim();
  if (q.length < 3) return null;
  const exact = t.indexOf(q, from);
  if (exact >= 0) return { start: exact, end: exact + q.length };
  const ft = fold(t);
  const fq = fold(q).folded.trim().replace(/^[\s"'.]+|[\s"'.]+$/g, '');
  if (fq.length < 3) return null;
  let fromFolded = 0;
  if (from > 0) {
    fromFolded = ft.map.findIndex((orig) => orig >= from);
    if (fromFolded < 0) return null;
  }
  const at = ft.folded.indexOf(fq, fromFolded);
  if (at < 0) return null;
  return { start: ft.map[at], end: ft.map[at + fq.length - 1] + 1 };
};

/* Locates each finding's quote, giving each one its own span where a quote
   repeats. Returns { located, unlocated }. */
const locateAll = (text, findings, key = 'quote') => {
  const located = [];
  const unlocated = [];
  const lastEnd = {};
  for (const f of findings || []) {
    const q = String(f[key] || '').trim();
    let span = locate(text, q, lastEnd[q] || 0);
    if (!span && lastEnd[q]) span = locate(text, q, 0);
    if (span) {
      lastEnd[q] = span.end;
      located.push({ ...f, start: span.start, end: span.end });
    } else {
      unlocated.push(f);
    }
  }
  return { located, unlocated };
};

const wordCount = (text) => (String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

module.exports = { MASK, redact, namesToHide, locate, locateAll, wordCount, fold };
