// Turning a line of workbook text into individually tappable words.
//
// The reading aid is "tap a word, hear that word." So we split text into tokens
// while KEEPING the whitespace tokens too, which lets the reader preserve line
// breaks and spacing exactly as they appeared on the page. Each non-space token
// is a tappable chip; punctuation stays attached for display ("cat." reads as
// "cat") but the audio key strips it so "cat," and "cat" share one cached clip.

// Normalize a display word down to the key we cache/speak by. Lowercased, outer
// punctuation trimmed, inner apostrophes/hyphens kept ("don't", "well-known").
export const wordSlug = (word) => {
  if (!word) return '';
  return String(word)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[‘’]/g, "'") // curly → straight apostrophe
    .replace(/[^a-z0-9'-]+/g, ' ')   // drop other punctuation
    .trim()
    .replace(/^['-]+|['-]+$/g, '')    // trim leading/trailing ' or -
    .replace(/\s+/g, '-');
};

// A token is speakable if it has real letters/numbers once slugged.
export const isSpeakable = (token) => /[a-z0-9]/.test(wordSlug(token));

// Split into an ordered list of tokens. Whitespace runs become { space:true }
// tokens (with the literal whitespace so newlines survive); everything else is
// a { word } token.
export const tokenize = (text) => {
  if (!text) return [];
  const parts = String(text).split(/(\s+)/);
  const tokens = [];
  for (const part of parts) {
    if (part === '') continue;
    if (/^\s+$/.test(part)) tokens.push({ space: true, value: part });
    else tokens.push({ word: part });
  }
  return tokens;
};

// Every distinct speakable slug in a chunk of text — used to warm the cache.
export const uniqueSlugs = (text) => {
  const set = new Set();
  for (const t of tokenize(text)) {
    if (t.word && isSpeakable(t.word)) set.add(wordSlug(t.word));
  }
  return [...set];
};
