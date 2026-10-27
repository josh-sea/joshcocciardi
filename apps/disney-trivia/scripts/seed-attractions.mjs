/* Build parks/attractions.json: the ride catalogue, fetched once and committed.
 *
 * The planner has to work on park wifi, which is to say barely at all. Names
 * and coordinates never change between visits, so they are baked into the app
 * and only the waits are fetched live. Rerun this when a ride opens or closes:
 *
 *   node apps/disney-trivia/scripts/seed-attractions.mjs
 *
 * Data from ThemeParks.wiki, which is free and asks for attribution. The app
 * credits it in the planner's footer.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://api.themeparks.wiki/v1';

// The four Walt Disney World theme parks. Water parks are out of scope.
export const PARKS = {
  mk: { id: '75ea578a-adc8-4116-a54d-dccb60765ef9', name: 'Magic Kingdom',     short: 'Magic Kingdom' },
  ep: { id: '47f90d2c-e191-4239-a466-5892ef59a88b', name: 'EPCOT',             short: 'EPCOT' },
  hs: { id: '288747d1-8b4f-4a64-867e-ea7c9b27bad8', name: 'Hollywood Studios', short: 'Hollywood' },
  ak: { id: '1c84a229-8862-4648-9c71-378ddd2c7693', name: 'Animal Kingdom',    short: 'Animal Kingdom' },
};

/* Rides that are not really rides. The API files parade viewing, trick-or-treat
 * stops and meet-and-greets as attractions, and a planner that routes you to a
 * "Trick-or-Treat Location" is worse than useless. Matched case-insensitively
 * against the name.
 */
const NOT_A_RIDE = [
  /trick-or-treat/i,
  /^meet /i,
  /\bmeet\b.*\bat\b/i,
  /character (greeting|meet)/i,
  /viewing (area|location)/i,
  /photo (pass|opportunity)/i,
  /disney vacation club/i,
];

const looksLikeARide = (name) => !NOT_A_RIDE.some((re) => re.test(name || ''));

/* How long you are on the thing once you reach the front, door to door. The
 * API does not publish this and it matters: the planner is budgeting your day
 * in minutes, and a 2-minute coaster and a 25-minute safari are not the same
 * commitment. Measured ride times, rounded, with a middling default for
 * anything not listed.
 */
const DEFAULT_RIDE_MINUTES = 6;

/* Keys are matched on a flattened name, because the feed's punctuation is a
 * minefield: curly apostrophes in "Rock 'n' Roller Coaster", literal double
 * quotes around "it's a small world", an en dash in "Star Tours - The
 * Adventures Continue". Exact-string keys silently miss and the ride quietly
 * takes the default, which is the kind of wrong that never announces itself.
 */
const flat = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

const RIDE_MINUTES = {
  // Magic Kingdom
  'Seven Dwarfs Mine Train': 3, 'Space Mountain': 3, 'TRON Lightcycle Run': 2,
  'Big Thunder Mountain Railroad': 4, 'Haunted Mansion': 9, 'Pirates of the Caribbean': 9,
  'Jungle Cruise': 10, 'Peter Pans Flight': 3, 'its a small world': 11,
  'Tianas Bayou Adventure': 6, 'The Hall of Presidents': 25, 'Astro Orbiter': 2,
  'Walt Disneys Carousel of Progress': 21, 'Country Bear Musical Jamboree': 12,
  'Mickeys PhilharMagic': 12, 'Monsters Inc Laugh Floor': 15, 'Dumbo the Flying Elephant': 2,
  'Tomorrowland Transit Authority PeopleMover': 10, 'Walt Disneys Enchanted Tiki Room': 10,
  'Enchanted Tales with Belle': 20, 'Buzz Lightyears Space Ranger Spin': 5,
  'The Many Adventures of Winnie the Pooh': 4, 'Mad Tea Party': 2, 'The Barnstormer': 1,
  'Under the Sea Journey of The Little Mermaid': 6, 'The Magic Carpets of Aladdin': 2,
  'Prince Charming Regal Carrousel': 2, 'Tomorrowland Speedway': 5, 'Swiss Family Treehouse': 10,
  'Walt Disney World Railroad Main Street USA': 20, 'Walt Disney World Railroad Fantasyland': 20,
  // EPCOT
  'Guardians of the Galaxy Cosmic Rewind': 3, 'Test Track': 5, 'Soarin Across America': 5,
  'Frozen Ever After': 5, 'Remys Ratatouille Adventure': 6, 'Spaceship Earth': 16,
  'Mission SPACE': 5, 'Living with the Land': 14, 'The American Adventure': 29,
  'Journey Into Imagination With Figment': 6, 'Gran Fiesta Tour Starring The Three Caballeros': 8,
  'The Seas with Nemo Friends': 4, 'Journey of Water Inspired by Moana': 15,
  'Awesome Planet': 10, 'Disney and Pixar Short Film Festival': 18,
  'Canada Far and Wide in CircleVision 360': 14, 'Impressions de France': 18,
  'Reflections of China': 13, 'Beauty and the Beast SingAlong': 16,
  // Hollywood Studios
  'Star Wars Rise of the Resistance': 18, 'Slinky Dog Dash': 2,
  'The Twilight Zone Tower of Terror': 5, 'Rock n Roller Coaster Starring The Muppets': 2,
  'Millennium Falcon Smugglers Run': 5, 'Toy Story Mania': 6,
  'Mickey Minnies Runaway Railway': 5, 'Star Tours The Adventures Continue': 7,
  'Alien Swirling Saucers': 2, 'Walt Disney Presents': 15,
  // Animal Kingdom
  'Avatar Flight of Passage': 5, 'Navi River Journey': 5, 'Kilimanjaro Safaris': 22,
  'Expedition Everest Legend of the Forbidden Mountain': 3, 'Kali River Rapids': 5,
  'Wildlife Express Train': 7, 'Gorilla Falls Exploration Trail': 20,
  'Maharajah Jungle Trek': 20, 'Discovery Island Trails': 15,
  'Zootopia Better Zoogether': 15, 'Blueys Wild World at Conservation Station': 12,
};

// Flattened once at load, so a lookup is a plain map hit.
const MINUTES_BY_FLAT = new Map(Object.entries(RIDE_MINUTES).map(([k, v]) => [flat(k), v]));
const rideMinutes = (name) => MINUTES_BY_FLAT.get(flat(name)) ?? DEFAULT_RIDE_MINUTES;


async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function main() {
  const out = { builtAt: new Date().toISOString(), source: 'themeparks.wiki', parks: {} };

  for (const [key, park] of Object.entries(PARKS)) {
    const kids = await get(`/entity/${park.id}/children`);

    /* Which entities actually have a standby queue. The catalogue is full of
     * things the API files as attractions that you simply walk into: galleries,
     * trails, the castle itself. They never post a wait, so a planner that
     * routes you to one is wasting your morning. Asking the live feed is more
     * honest than guessing from the name. */
    const live = await get(`/entity/${park.id}/live`);
    const queued = new Set(
      (live.liveData || [])
        .filter((e) => e.queue && e.queue.STANDBY)
        .map((e) => e.id)
    );

    const rides = (kids.children || [])
      .filter((c) => c.entityType === 'ATTRACTION')
      .filter((c) => looksLikeARide(c.name))
      .filter((c) => c.location && typeof c.location.latitude === 'number')
      .map((c) => ({
        id: c.id,
        name: c.name,
        lat: Number(c.location.latitude.toFixed(6)),
        lng: Number(c.location.longitude.toFixed(6)),
        queued: queued.has(c.id),
        minutes: rideMinutes(c.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    out.parks[key] = { id: park.id, name: park.name, short: park.short, rides };
    const q = rides.filter((r) => r.queued).length;
    console.log(`${key}: ${rides.length} attractions, ${q} with a standby queue`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '..', 'parks', 'attractions.json');
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote', path);
}

main().catch((err) => { console.error(err); process.exit(1); });
