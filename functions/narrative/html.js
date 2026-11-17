// ---------------------------------------------------------------------------
// Capture: turn a fetched web page into plain text plus whatever metadata the
// page declares about itself. Pure functions, no dependencies, so the test
// suite runs without an install.
//
// This is deliberately simple. It prefers <article>, then <main>, then the
// body, drops scripts, navigation and boilerplate, and keeps paragraph breaks.
// A page that comes back too short (a paywall, a JavaScript-only app, a block
// page) is reported as unreadable so the person pastes the text instead.
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

const decodeEntities = (s) =>
  String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const v = ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').trim() : '';
};

/* <meta> values by property or name, first match wins. */
const metaValues = (html) => {
  const out = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase();
    const content = attr(tag, 'content');
    if (key && content && !(key in out)) out[key] = content;
  }
  return out;
};

/* JSON-LD often carries the cleanest author and date. Tolerates arrays,
   @graph wrappers, and malformed blocks. */
const jsonLd = (html) => {
  const found = {};
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes = [];
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) return x.forEach(walk);
      nodes.push(x);
      if (x['@graph']) walk(x['@graph']);
    };
    walk(data);
    for (const n of nodes) {
      const type = [].concat(n['@type'] || []).join(' ');
      if (!/Article|Posting|Report|NewsArticle|BlogPosting|WebPage/i.test(type)) continue;
      const authors = [].concat(n.author || []).map((a) => (typeof a === 'string' ? a : a && a.name)).filter(Boolean);
      if (authors.length && !found.author) found.author = authors.join(', ');
      if (n.datePublished && !found.published) found.published = String(n.datePublished);
      if (n.headline && !found.title) found.title = String(n.headline);
      const pub = n.publisher && (typeof n.publisher === 'string' ? n.publisher : n.publisher.name);
      if (pub && !found.publisher) found.publisher = String(pub);
    }
  }
  return found;
};

const BLOCK = /<\/?(p|div|section|article|main|h[1-6]|li|ul|ol|blockquote|pre|tr|table|figure|figcaption|header|footer|br|hr)\b[^>]*>/gi;

const textOf = (fragment) =>
  decodeEntities(
    fragment
      .replace(/<(script|style|noscript|template|svg|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(BLOCK, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/* The largest of the candidate containers, so a page with a tiny <article>
   teaser and the real story in <main> still yields the story. */
const mainFragment = (html) => {
  const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [null, html])[1];
  const stripped = body.replace(/<(nav|aside|header|footer)\b[\s\S]*?<\/\1>/gi, ' ');
  const candidates = [];
  for (const tag of ['article', 'main']) {
    for (const m of stripped.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))) candidates.push(m[1]);
  }
  const best = candidates.map((c) => ({ c, n: textOf(c).length })).sort((a, b) => b.n - a.n)[0];
  return best && best.n > 400 ? best.c : stripped;
};

const MIN_READABLE_CHARS = 400;
const MAX_LINKS = 80;

/* Outbound links inside the story: the strongest evidence of what an item
   derives from. Same-site navigation and fragments are dropped. */
const linksIn = (fragment, baseUrl) => {
  const out = [];
  const seen = new Set();
  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch {
    baseHost = '';
  }
  for (const m of fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(`<a ${m[1]}>`, 'href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl || undefined).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(abs)) continue;
    const host = new URL(abs).hostname.replace(/^www\./, '');
    const text = textOf(m[2]).replace(/\s+/g, ' ').slice(0, 160);
    if (host === baseHost && text.length < 25) continue; // menus, tags, author pages
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ href: abs, text });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
};

/* Everything capture needs from one page. `readable` is false when the text is
   too short to be the real content. */
const extractPage = (html, url = '') => {
  const src = String(html || '');
  const meta = metaValues(src);
  const ld = jsonLd(src);
  const titleTag = decodeEntities((src.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const fragment = mainFragment(src);
  const text = textOf(fragment);
  let host = '';
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    host = '';
  }
  return {
    text,
    links: url ? linksIn(fragment, url) : [],
    readable: text.length >= MIN_READABLE_CHARS,
    meta: {
      title: ld.title || meta['og:title'] || meta['twitter:title'] || titleTag || '',
      author: ld.author || meta.author || meta['article:author'] || meta['parsely-author'] || meta['sailthru.author'] || '',
      publisher: ld.publisher || meta['og:site_name'] || meta['application-name'] || host || '',
      published: ld.published || meta['article:published_time'] || meta['parsely-pub-date'] || meta.date || meta['dc.date'] || '',
      description: meta['og:description'] || meta.description || '',
      host,
    },
  };
};

/* Normalized form of a URL for matching an upstream reference to a stored
   item: no scheme, no www, no tracking parameters, no trailing slash. */
const normalizeUrl = (raw) => {
  if (!raw) return '';
  try {
    const u = new URL(String(raw).trim());
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|ref_|cmpid|smid|s$|share)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    const q = u.searchParams.toString();
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}${q ? `?${q}` : ''}`;
  } catch {
    return '';
  }
};

module.exports = { extractPage, decodeEntities, normalizeUrl, textOf, MIN_READABLE_CHARS };
