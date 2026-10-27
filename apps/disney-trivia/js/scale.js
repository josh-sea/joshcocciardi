/* "1 to 10": a Disney guessing game, and the topic builder that feeds it.
 *
 * One person picks a secret number from 1 to 10. That number is how much
 * they like things. Someone else names a category, and the picker answers
 * with something they would rate exactly that: ask for an EPCOT ride on an
 * 8 and you get Frozen Ever After, not Guardians and not Imagination. A few
 * answers in, you guess the number.
 *
 * The app's whole job is to produce good categories and keep score. It
 * stores nothing about actual desserts, because the players already know
 * what the desserts are. That is why this is pure string work and why all
 * of it runs in node under the test suite.
 */

/* ── what you are rating ──────────────────────────────────────────────────
 *
 * `takes` says which places make sense. Rides happen in parks; shops happen
 * at Disney Springs and the resorts too; films happen nowhere in particular.
 * Offering "Disney films in Magic Kingdom" would be the builder getting in
 * the way rather than helping.
 */
export const PLACE_PARKS = 'parks';
export const PLACE_SPRINGS = 'springs';
export const PLACE_RESORTS = 'resorts';
export const PLACE_NONE = 'none';

export const SUBJECTS = [
  // In the parks
  { id: 'ride',        label: 'Rides',             phrase: 'rides',                      takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'coaster',     label: 'Roller coasters',   phrase: 'roller coasters',            takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'dark',        label: 'Dark rides',        phrase: 'dark rides',                 takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'thrill',      label: 'Scary rides',       phrase: 'the scariest rides',         takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'little',      label: 'Rides for little kids', phrase: 'rides for little kids',  takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'single',      label: 'Single rider lines', phrase: 'single rider lines',        takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'queue',       label: 'Queues',            phrase: 'queues',                     takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'show',        label: 'Shows',             phrase: 'shows',                      takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'fireworks',   label: 'Parades & fireworks', phrase: 'parades and fireworks',    takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'land',        label: 'Lands',             phrase: 'lands',                      takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'country',     label: 'World Showcase countries', phrase: 'World Showcase countries', takes: [PLACE_NONE], group: 'Parks' },
  { id: 'character',   label: 'Characters to meet', phrase: 'characters to meet',        takes: [PLACE_PARKS], group: 'Parks' },
  { id: 'transport',   label: 'Ways to get around', phrase: 'ways to get around',        takes: [PLACE_PARKS, PLACE_RESORTS], group: 'Parks' },

  // Eating
  { id: 'quick',       label: 'Quick service food', phrase: 'quick service food',        takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },
  { id: 'sitdown',     label: 'Sit-down restaurants', phrase: 'sit-down restaurants',    takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },
  { id: 'snack',       label: 'Snacks',            phrase: 'snacks',                     takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },
  { id: 'dessert',     label: 'Desserts',          phrase: 'desserts',                   takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },
  { id: 'icecream',    label: 'Ice cream & treats', phrase: 'ice cream and frozen treats', takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },
  { id: 'drink',       label: 'Drinks',            phrase: 'drinks',                     takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },
  { id: 'breakfast',   label: 'Breakfasts',        phrase: 'breakfasts',                 takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Food' },

  // Spending money
  { id: 'shop',        label: 'Shops',             phrase: 'shops',                      takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Shopping' },
  { id: 'souvenir',    label: 'Souvenirs',         phrase: 'souvenirs',                  takes: [PLACE_PARKS, PLACE_SPRINGS, PLACE_RESORTS], group: 'Shopping' },

  // Staying
  { id: 'hotel',       label: 'Resort hotels',     phrase: 'resort hotels',              takes: [PLACE_NONE], group: 'Resorts' },
  { id: 'pool',        label: 'Resort pools',      phrase: 'resort pools',               takes: [PLACE_NONE], group: 'Resorts' },

  // Nothing to do with the parks at all
  { id: 'film',        label: 'Disney films',      phrase: 'Disney films',               takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'pixar',       label: 'Pixar films',       phrase: 'Pixar films',                takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'song',        label: 'Disney songs',      phrase: 'Disney songs',               takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'villain',     label: 'Villains',          phrase: 'Disney villains',            takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'princess',    label: 'Princesses',        phrase: 'Disney princesses',          takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'sidekick',    label: 'Sidekicks',         phrase: 'sidekicks',                  takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'star',        label: 'Star Wars things',  phrase: 'Star Wars things',           takes: [PLACE_NONE], group: 'Disney at large' },
  { id: 'marvel',      label: 'Marvel things',     phrase: 'Marvel characters',          takes: [PLACE_NONE], group: 'Disney at large' },
];

/* ── where ───────────────────────────────────────────────────────────────── */

export const PLACES = [
  { id: 'mk',      label: 'Magic Kingdom',    phrase: 'Magic Kingdom',       kind: PLACE_PARKS },
  { id: 'ep',      label: 'EPCOT',            phrase: 'EPCOT',               kind: PLACE_PARKS },
  { id: 'hs',      label: 'Hollywood Studios', phrase: 'Hollywood Studios',  kind: PLACE_PARKS },
  { id: 'ak',      label: 'Animal Kingdom',   phrase: 'Animal Kingdom',      kind: PLACE_PARKS },
  { id: 'springs', label: 'Disney Springs',   phrase: 'Disney Springs',      kind: PLACE_SPRINGS },
  { id: 'resorts', label: 'The resorts',      phrase: 'the resorts',         kind: PLACE_RESORTS },
];

export const PARK_IDS = PLACES.filter((p) => p.kind === PLACE_PARKS).map((p) => p.id);

// Which places a subject will accept. Used to grey out the rest.
export function placesFor(subjectId) {
  const s = SUBJECTS.find((x) => x.id === subjectId);
  if (!s) return [];
  if (s.takes.includes(PLACE_NONE) && s.takes.length === 1) return [];
  return PLACES.filter((p) => s.takes.includes(p.kind)).map((p) => p.id);
}

/* "Magic Kingdom", "Magic Kingdom or EPCOT", "Magic Kingdom, EPCOT or
 * Hollywood Studios". Oxford comma deliberately absent: these are read
 * aloud, and "or" alone scans better out loud.
 */
export function joinPlaces(names) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* Compose the thing you actually read out.
 *
 * "Desserts in Magic Kingdom". "Roller coasters in any park". "Queues in
 * Hollywood Studios". Picking every park says "any park" rather than listing
 * all four, which is both shorter and what you would say.
 */
export function topicFor(subjectId, placeIds = []) {
  const s = SUBJECTS.find((x) => x.id === subjectId);
  if (!s) return '';

  const allowed = new Set(placesFor(subjectId));
  const picked = placeIds.filter((id) => allowed.has(id));

  if (!picked.length) {
    // No place, either because the subject takes none or none was chosen.
    return cap(allowed.size ? `${s.phrase} in any park` : s.phrase);
  }

  const parks = picked.filter((id) => PARK_IDS.includes(id));
  const others = picked.filter((id) => !PARK_IDS.includes(id));
  const nameOf = (id) => (PLACES.find((p) => p.id === id) || {}).phrase;

  // Every park and nothing else reads better as "any park".
  const everyPark = parks.length === PARK_IDS.length;
  const bits = [];
  if (everyPark) bits.push('any park');
  else bits.push(...parks.map(nameOf));
  bits.push(...others.map(nameOf));

  // "at Disney Springs" but "in Magic Kingdom": the preposition follows
  // whatever comes first in the list.
  const firstIsPark = everyPark || parks.length > 0;
  const prep = firstIsPark ? 'in' : 'at';
  return cap(`${s.phrase} ${prep} ${joinPlaces(bits)}`);
}

/* A topic out of nowhere, for when nobody can think of one. Weighted toward
 * the park subjects, because that is where you are standing.
 */
export function randomTopic(rand = Math.random) {
  const s = SUBJECTS[Math.floor(rand() * SUBJECTS.length)];
  const allowed = placesFor(s.id);
  if (!allowed.length) return topicFor(s.id, []);

  const parkish = allowed.filter((id) => PARK_IDS.includes(id));
  // Half the time pin it to one park, which makes a sharper question.
  if (parkish.length && rand() < 0.5) {
    return topicFor(s.id, [parkish[Math.floor(rand() * parkish.length)]]);
  }
  return topicFor(s.id, []);
}

/* ── the round ───────────────────────────────────────────────────────────── */

export const SCALE_MIN = 1;
export const SCALE_MAX = 10;
export const DEFAULT_QUESTIONS = 3;

export function secretNumber(rand = Math.random) {
  return SCALE_MIN + Math.floor(rand() * (SCALE_MAX - SCALE_MIN + 1));
}

export function isValidGuess(n) {
  return Number.isInteger(n) && n >= SCALE_MIN && n <= SCALE_MAX;
}

/* Scoring. Dead on is worth a lot; one out is still a good read.
 *
 * Deliberately generous at a distance of one, because the whole game is
 * fuzzy: whether Frozen Ever After is your 6 or your 7 is not a fact, and a
 * scheme that only rewarded exactness would make it feel arbitrary.
 */
export const POINTS = { exact: 5, within1: 3, within2: 1 };

export function scoreGuess(guess, secret) {
  if (!isValidGuess(guess) || !isValidGuess(secret)) return 0;
  const off = Math.abs(guess - secret);
  if (off === 0) return POINTS.exact;
  if (off === 1) return POINTS.within1;
  if (off === 2) return POINTS.within2;
  return 0;
}

export function verdictFor(guess, secret) {
  if (!isValidGuess(guess) || !isValidGuess(secret)) return '';
  const off = Math.abs(guess - secret);
  if (off === 0) return 'Spot on.';
  if (off === 1) return 'One out. Close enough to count.';
  if (off === 2) return 'Two out.';
  if (off <= 4) return 'Not quite.';
  return 'Nowhere near.';
}
