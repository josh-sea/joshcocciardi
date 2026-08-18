// Taxonomy for the collector shop.
//
// Instead of one flat set of dropdowns, each top-level CATEGORY defines its own
// ordered chain of "levels". The card editor renders exactly the levels that
// make sense for the chosen category, so a Pokémon card asks for Game → Product
// (not Sport → League), while a sports card asks Sport → League. Finer detail
// (brand, set, year — "2026 Bowman Chrome", "Topps") is left to free tags.
//
// A level is either a flat `options` list, or a dependent one: `by` names an
// earlier level and `optionsBy` maps that level's value to this level's options
// (e.g. Sport = Football → League ∈ [NFL, NCAA, …]).
//
// On an item this is stored as:  category: '<id>',  taxa: { <levelKey>: value }
// Everything here is optional — you can add an item with no category at all.

export const TAXONOMY = [
  {
    id: 'sports',
    label: 'Sports Cards',
    levels: [
      {
        key: 'sport',
        label: 'Sport',
        options: ['Football', 'Basketball', 'Baseball', 'Hockey', 'Soccer', 'Golf', 'Racing', 'Boxing / MMA', 'Wrestling', 'Other'],
      },
      {
        key: 'league',
        label: 'League',
        by: 'sport',
        optionsBy: {
          Football: ['NFL', 'NCAA', 'CFL', 'UFL', 'Other'],
          Basketball: ['NBA', 'WNBA', 'NCAA', 'EuroLeague', 'Other'],
          Baseball: ['MLB', 'MiLB', 'NCAA', 'NPB', 'Other'],
          Hockey: ['NHL', 'AHL', 'NCAA', 'KHL', 'Other'],
          Soccer: ['MLS', 'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'UEFA', 'World Cup', 'Other'],
          Golf: ['PGA', 'LPGA', 'Other'],
          Racing: ['NASCAR', 'F1', 'IndyCar', 'Other'],
          'Boxing / MMA': ['UFC', 'Boxing', 'Bellator', 'Other'],
          Wrestling: ['WWE', 'AEW', 'Other'],
          Other: ['Other'],
        },
      },
    ],
  },
  {
    id: 'tcg',
    label: 'Trading Card Game',
    levels: [
      {
        key: 'game',
        label: 'Game',
        options: ['Pokémon', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'Disney Lorcana', 'One Piece', 'Digimon', 'Flesh and Blood', 'Other'],
      },
      {
        key: 'product',
        label: 'Product',
        options: ['Single card', 'Sealed (pack/box)', 'Deck', 'Promo', 'Other'],
      },
    ],
  },
  {
    id: 'comics',
    label: 'Comics',
    levels: [
      {
        key: 'publisher',
        label: 'Publisher',
        options: ['Marvel', 'DC', 'Image', 'Dark Horse', 'IDW', 'Boom! Studios', 'Other'],
      },
      {
        key: 'format',
        label: 'Format',
        options: ['Single issue', 'Graphic novel / TPB', 'Other'],
      },
    ],
  },
  {
    id: 'memorabilia',
    label: 'Memorabilia',
    levels: [
      {
        key: 'itemType',
        label: 'Item',
        options: ['Jersey', 'Helmet', 'Ball', 'Bat', 'Puck', 'Glove', 'Autograph', 'Photo / Print', 'Ticket / Program', 'Figure / Funko', 'Other'],
      },
      {
        key: 'sport',
        label: 'Sport (if any)',
        options: ['Football', 'Basketball', 'Baseball', 'Hockey', 'Soccer', 'Boxing / MMA', 'Other', 'N/A'],
      },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    levels: [],
  },
];

// ── Lookups ──────────────────────────────────────────────────────────────────

export const categoryById = (id) => TAXONOMY.find((c) => c.id === id) || null;

export const categoryLabel = (id) => categoryById(id)?.label || id || '';

// Resolve a loose input (an id, a label, or an AI's free text) to a category id.
const CATEGORY_SYNONYMS = [
  { id: 'tcg', re: /pok[eé]mon|magic|mtg|yu-?gi|lorcana|one piece|digimon|trading card game|\btcg\b/i },
  { id: 'sports', re: /sport|football|basketball|baseball|hockey|soccer|nfl|nba|mlb|nhl/i },
  { id: 'comics', re: /comic|marvel|\bdc\b|graphic novel/i },
  { id: 'memorabilia', re: /memorabilia|jersey|helmet|autograph|ticket|funko|relic/i },
];
export const resolveCategoryId = (input) => {
  if (!input) return '';
  const v = String(input).trim().toLowerCase();
  const byId = TAXONOMY.find((c) => c.id === v);
  if (byId) return byId.id;
  const byLabel = TAXONOMY.find((c) => c.label.toLowerCase() === v);
  if (byLabel) return byLabel.id;
  const syn = CATEGORY_SYNONYMS.find((s) => s.re.test(input));
  return syn ? syn.id : '';
};

// Options for a level given the taxa chosen so far (handles dependent levels).
export const levelOptions = (catId, level, taxa = {}) => {
  if (level.options) return level.options;
  if (level.optionsBy) return level.optionsBy[taxa[level.by]] || [];
  return [];
};

// "Sports Cards · Football · NFL" — the human category line for a card/list row.
// Falls back to the pre-taxonomy fields so older items still read correctly.
export const categoryLine = (item) => {
  const cat = categoryById(item.category);
  if (cat) {
    const parts = [cat.label];
    for (const lvl of cat.levels) {
      const v = item.taxa?.[lvl.key];
      if (v && v !== 'N/A') parts.push(v);
    }
    return parts.join(' · ');
  }
  // Legacy items (category was a label; sport/league/itemType were flat fields).
  return [item.category, item.sport, item.league, item.itemType].filter(Boolean).join(' · ');
};

// All taxonomy text for an item, for the search index.
export const itemTaxaText = (item) => {
  const cat = categoryById(item.category);
  if (cat) return [cat.label, ...Object.values(item.taxa || {})].filter(Boolean).join(' ');
  return [item.category, item.sport, item.league, item.itemType].filter(Boolean).join(' ');
};

// ── Other pick-lists ─────────────────────────────────────────────────────────

export const GRADING_COMPANIES = ['PSA', 'BGS (Beckett)', 'SGC', 'CGC', 'CSG', 'HGA', 'Other'];

export const ACQUIRED_SOURCES = [
  'Card show', 'Convention / Expo', 'eBay', 'Facebook Marketplace', 'Local shop',
  'Estate / Yard sale', 'Trade', 'Had it forever', 'Other',
];

export const SOLD_CHANNELS = [
  'eBay', 'Card show', 'Convention / Expo', 'Facebook Marketplace', 'Whatnot',
  'Local shop', 'In person', 'Trade', 'Other',
];

export const ITEM_STATUS = {
  INVENTORY: 'inventory',
  SOLD: 'sold',
};
