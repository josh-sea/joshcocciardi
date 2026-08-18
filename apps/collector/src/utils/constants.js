// Taxonomy for the collector shop. Everything here is optional at add-time —
// these lists just power the dropdowns so tagging stays consistent. "Other"
// is always available, and free-text tags cover anything not listed.

// Top-level buckets.
export const CATEGORIES = [
  'Sports',
  'Trading Cards',
  'Comics',
  'Memorabilia',
  'Other',
];

// Sports → leagues. Used when category is "Sports" (or when a card/gear is
// tied to a sport). Leagues are suggestions, not a closed list.
export const SPORTS = [
  'Football',
  'Basketball',
  'Baseball',
  'Hockey',
  'Soccer',
  'Golf',
  'Boxing / MMA',
  'Racing',
  'Wrestling',
  'Other',
];

export const LEAGUES_BY_SPORT = {
  Football: ['NFL', 'NCAA', 'CFL', 'XFL / UFL', 'Other'],
  Basketball: ['NBA', 'WNBA', 'NCAA', 'EuroLeague', 'Other'],
  Baseball: ['MLB', 'MiLB', 'NCAA', 'NPB', 'Other'],
  Hockey: ['NHL', 'AHL', 'NCAA', 'KHL', 'Other'],
  Soccer: ['MLS', 'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'UEFA', 'World Cup', 'Other'],
  Golf: ['PGA', 'LPGA', 'Other'],
  'Boxing / MMA': ['UFC', 'Boxing', 'Bellator', 'Other'],
  Racing: ['NASCAR', 'F1', 'IndyCar', 'Other'],
  Wrestling: ['WWE', 'AEW', 'Other'],
  Other: ['Other'],
};

// What the physical thing is.
export const ITEM_TYPES = [
  'Card',
  'Autograph',
  'Jersey',
  'Helmet',
  'Ball',
  'Bat / Stick',
  'Gear / Equipment',
  'Ticket / Program',
  'Photo / Print',
  'Comic Book',
  'Figure / Toy',
  'Coin / Bill',
  'Other',
];

// Grading companies for graded cards / slabs.
export const GRADING_COMPANIES = [
  'PSA',
  'BGS (Beckett)',
  'SGC',
  'CGC',
  'CSG',
  'HGA',
  'Other',
];

// Where things get bought — quick presets for the "acquired from" field.
export const ACQUIRED_SOURCES = [
  'Card show',
  'Convention / Expo',
  'eBay',
  'Facebook Marketplace',
  'Local shop',
  'Estate / Yard sale',
  'Trade',
  'Had it forever',
  'Other',
];

// Where things get sold — quick presets for the "sold via" field.
export const SOLD_CHANNELS = [
  'eBay',
  'Card show',
  'Convention / Expo',
  'Facebook Marketplace',
  'Whatnot',
  'Local shop',
  'In person',
  'Trade',
  'Other',
];

export const ITEM_STATUS = {
  INVENTORY: 'inventory',
  SOLD: 'sold',
};
