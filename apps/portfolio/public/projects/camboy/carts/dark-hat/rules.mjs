/**
 * Dark Hat: Sorcerer's Escape. A game by Campbell, cartridge #3 for the Camboy.
 *
 * You fell into the Great Malvado's top hat. Inside, his dark magic holds
 * the spirits of everyone he has caught. If your soul runs out before you
 * escape, you become his next trick. Trapped spirits can't leave, but they
 * can teach you their tricks. Fight down through the layers of the hat and
 * beat Malvado at the bottom to get out.
 *
 * Seen from above like Link's Awakening: each layer is a grid of rooms,
 * and a ladder down opens when the layer's boss is beaten.
 *
 * Every trick has two paths. Pick one and you're committed to it for the
 * rest of the run, until you're caught or start over.
 *
 * This module holds the rules with no canvas, timers or input: the tricks,
 * the maps, collision, names, story text and run saves.
 */

export const W = 160;
export const H = 144;
export const TILE = 8;
export const COLS = 20;
export const ROWS = 16;
export const TOP = 16;               // the room sits under a 16 px status bar

export const SPEED = 50;             // pixels per second
export const MAX_HEARTS = 3;         // in whole hearts; health counts halves
export const SOUL_MAX = 100;
export const SOUL_DRAIN = 0.45;      // per second: a full soul lasts about four minutes
export const NAME_LEN = 4;
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
export const LINE_CHARS = 38;        // characters in a line of a text box

/* ---------- names and story text ---------- */

/** Up to four letters, A to Z. Anything else is dropped. */
export function cleanName(s) {
  const n = String(s ?? "").toUpperCase().replace(/[^A-Z ]/g, "").slice(0, NAME_LEN).trim();
  return n || "HERO";
}

/** Fill in the player's name and wrap into lines that fit the text box. */
export function say(text, name, width = LINE_CHARS) {
  const filled = String(text).replaceAll("{N}", cleanName(name));
  const lines = [];
  for (const para of filled.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += " " + word;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

export const STORY = {
  intro: [
    "{N} HAD FRONT ROW SEATS FOR THE GREAT MALVADO'S MAGIC SHOW.",
    "\"I NEED A VOLUNTEER!\" HE GRINNED. THE HAT TIPPED... AND {N} FELL IN!",
    "INSIDE THE HAT IT IS DARK. SPIRITS FLOAT IN THE GLOOM. ALL OF THEM WERE CAUGHT BY MALVADO.",
    "IF {N}'S SOUL RUNS OUT, {N} BECOMES HIS NEXT TRICK. FIND THE WAY DOWN, BEAT MALVADO, AND ESCAPE!",
  ],
  spiritIntro: "{N}... I CAN'T LEAVE THIS HAT. BUT I CAN TEACH YOU MY TRICK.",
  spiritChoose: "CHOOSE ONE PATH. ONCE YOU PICK, THERE'S NO GOING BACK.",
  fountain: "A POOL OF STOLEN STARLIGHT. {N}'S SOUL IS FULL AGAIN.",
  bossDoor: "THE DOORS SLAM SHUT!",
  ladder: "A LADDER DOWN, DEEPER INTO THE HAT...",
  caught: "THE AMAZING {N}! TONIGHT ONLY! THE KID WHO DISAPPEARED INTO A HAT!",
  escape: [
    "MALVADO'S HAT SHAKES. THE DARK MAGIC IS BREAKING!",
    "EVERY SPIRIT {N} MET RISES UP AND LIFTS {N} TOWARD THE LIGHT.",
    "{N} TUMBLES OUT OF THE HAT ONTO THE STAGE. THE CROWD GOES WILD.",
    "THE SPIRITS ARE FREE. MALVADO'S SHOW IS OVER. {N} ESCAPED THE DARK HAT!",
  ],
};

/* ---------- tricks ---------- */

/**
 * The tricks, each with two paths. cards is known from the start in its
 * plain form; its spirit at the bottom of the hat offers the upgrade.
 * For each path: cooldown in seconds and damage per hit.
 */
export const TRICKS = {
  cards: {
    name: "CARD TOSS",
    basic: { cd: 0.32, dmg: 1 },
    paths: {
      fan: { name: "FAN OF THREE", desc: "THROW THREE CARDS IN A SPREAD.", cd: 0.36, dmg: 1 },
      ace: { name: "ACE THROUGH", desc: "ONE HARD CARD THAT FLIES THROUGH EVERYTHING.", cd: 0.3, dmg: 2 },
    },
  },
  vanish: {
    name: "VANISH",
    paths: {
      blink: { name: "LONG BLINK", desc: "VANISH AND REAPPEAR FAR AHEAD, RIGHT THROUGH ENEMIES.", cd: 1.6, dmg: 0 },
      decoy: { name: "RABBIT DECOY", desc: "A SHORT HOP THAT LEAVES A RABBIT BEHIND TO FOOL THEM.", cd: 3, dmg: 0 },
    },
  },
  tornado: {
    name: "CARD TORNADO",
    paths: {
      shield: { name: "CARD SHIELD", desc: "CARDS CIRCLE YOU. THEY BLOCK SPARKS AND DRINK THEIR MAGIC.", cd: 9, dmg: 1 },
      storm: { name: "CARD STORM", desc: "CARDS BURST OUT IN A RING ALL AROUND YOU.", cd: 2.6, dmg: 1 },
    },
  },
  wand: {
    name: "WAND WHISTLE",
    paths: {
      homing: { name: "HUNTING WAND", desc: "WHISTLE AND THE WAND FINDS ENEMIES ON ITS OWN.", cd: 2.4, dmg: 2 },
      steer: { name: "STEERED WAND", desc: "HOLD THE BUTTON AND STEER THE WAND YOURSELF. HITS HARDER.", cd: 2.4, dmg: 3 },
    },
  },
  hat: {
    name: "HAT BOOMERANG",
    paths: {
      magnet: { name: "MAGNET HAT", desc: "THE HAT PULLS SPARKLES AND HEARTS BACK TO YOU.", cd: 1.1, dmg: 2 },
      grow: { name: "GROWING HAT", desc: "THE HAT GETS BIGGER AND STRONGER WITH EVERY HIT.", cd: 1.3, dmg: 2 },
    },
  },
  whip: {
    name: "SCARF WHIP",
    paths: {
      grab: { name: "GRABBING SCARF", desc: "LASH AND PULL ENEMIES IN. THEY'RE DIZZY FOR A MOMENT.", cd: 0.55, dmg: 2 },
      doves: { name: "DOVE SCARF", desc: "DOVES BURST FROM THE TIP AND CHASE ENEMIES.", cd: 0.65, dmg: 2 },
    },
  },
};

/** Cooldown and damage for a trick as it's known right now. */
export function trickStats(trick, path) {
  const t = TRICKS[trick];
  if (!t) return null;
  if (path && t.paths[path]) return t.paths[path];
  return t.basic ?? null;
}

/** A run knows a trick when it has an entry for it (cards: null means plain). */
export const knows = (run, trick) => Object.prototype.hasOwnProperty.call(run.tricks, trick) && (run.tricks[trick] !== null || TRICKS[trick].basic);

/**
 * Learn a trick down one path. Committed for the run: a trick that already
 * has a path can't change it. Returns true if it took.
 */
export function choosePath(run, trick, path) {
  const t = TRICKS[trick];
  if (!t || !t.paths[path]) return false;
  if (run.tricks[trick]) return false;
  run.tricks[trick] = path;
  // A new trick goes straight onto an empty button, so it can be tried at once.
  if (!run.equip.b && trick !== run.equip.a) run.equip.b = trick;
  return true;
}

/** Tricks you could put on a button: the ones you know. */
export const usable = (run) => Object.keys(TRICKS).filter((k) => knows(run, k));

/* ---------- the hat's layers ---------- */

/**
 * Each layer is a grid of rooms. S start, E enemies, P a trapped spirit,
 * F a soul fountain, B the boss. Spirits teach their tricks in order.
 */
export const LAYERS = [
  {
    name: "THE VELVET BRIM",
    grid: ["S E P", "E F E", "P E B"],
    spirits: ["vanish", "tornado"],
    enemies: ["spark", "glove", "bunny"],
    boss: "rabbit",
  },
  {
    name: "CARD CATACOMBS",
    grid: ["S E P", "P E E", "E P B"],
    spirits: ["wand", "hat", "whip"],
    enemies: ["spark", "soldier", "glove", "wisp"],
    boss: "king",
  },
  {
    name: "THE BOTTOM",
    grid: ["S P", "F B"],
    spirits: ["cards"],
    enemies: ["spark", "soldier", "wisp"],
    boss: "malvado",
  },
];

export const BOSSES = {
  rabbit: { name: "THE GIANT RABBIT", hp: 20 },
  king: { name: "THE CARD KING", hp: 26 },
  malvado: { name: "THE GREAT MALVADO", hp: 40 },
};

export const ENEMIES = {
  spark: { hp: 1, speed: 26, touch: 1 },
  glove: { hp: 2, speed: 20, touch: 1 },
  bunny: { hp: 2, speed: 36, touch: 1 },
  soldier: { hp: 3, speed: 14, touch: 1 },
  wisp: { hp: 3, speed: 8, touch: 1 },
};

/** Obstacles inside a room, in tiles: [x, y, w, h]. Doors stay clear. */
export const TEMPLATES = [
  [],
  [[4, 4, 2, 2], [14, 4, 2, 2], [4, 10, 2, 2], [14, 10, 2, 2]],
  [[8, 5, 4, 2], [8, 9, 4, 2]],
  [[3, 4, 5, 1], [12, 4, 5, 1], [3, 11, 5, 1], [12, 11, 5, 1]],
  [[5, 3, 1, 1], [12, 5, 2, 1], [6, 10, 1, 2], [15, 11, 1, 1], [3, 12, 2, 1], [13, 2, 1, 1]],
  [[6, 6, 1, 4], [13, 6, 1, 4]],
];

export const DOOR_COLS = [9, 10];
export const DOOR_ROWS = [7, 8];

/** Read a layer's grid into rooms with their neighbors and contents. */
export function layoutLayer(index) {
  const L = LAYERS[index];
  const grid = L.grid.map((r) => r.split(" "));
  const rows = grid.length, cols = grid[0].length;
  const rooms = [];
  let spirit = 0;
  grid.forEach((row, gy) => row.forEach((code, gx) => {
    const id = gy * cols + gx;
    const kind = { S: "start", E: "enemy", P: "spirit", F: "fountain", B: "boss" }[code];
    const tpl = kind === "boss" || kind === "start" ? 0 : ((id * 7 + index * 3) % (TEMPLATES.length - 1)) + 1;
    rooms.push({
      id, gx, gy, kind, template: tpl,
      spirit: kind === "spirit" ? L.spirits[spirit++] : null,
      doors: {
        up: gy > 0, down: gy < rows - 1, left: gx > 0, right: gx < cols - 1,
      },
    });
  }));
  return { cols, rows, rooms, start: rooms.find((r) => r.kind === "start").id, boss: rooms.find((r) => r.kind === "boss").id };
}

/** The room next door in a direction, or null. */
export function neighbor(layout, id, dir) {
  const r = layout.rooms[id];
  if (!r.doors[dir]) return null;
  const dx = { left: -1, right: 1 }[dir] || 0;
  const dy = { up: -1, down: 1 }[dir] || 0;
  return (r.gy + dy) * layout.cols + (r.gx + dx);
}

/**
 * A room's tiles: 1 is wall, 0 is floor. Walls all around, a two-tile gap
 * for each door (unless sealed), and the template's obstacles inside.
 */
export function roomTiles(room, sealed = false) {
  const t = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? 1 : 0)));
  if (!sealed) {
    if (room.doors.up) DOOR_COLS.forEach((x) => (t[0][x] = 0));
    if (room.doors.down) DOOR_COLS.forEach((x) => (t[ROWS - 1][x] = 0));
    if (room.doors.left) DOOR_ROWS.forEach((y) => (t[y][0] = 0));
    if (room.doors.right) DOOR_ROWS.forEach((y) => (t[y][COLS - 1] = 0));
  }
  for (const [x, y, w, h] of TEMPLATES[room.template]) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) t[yy][xx] = 1;
  }
  return t;
}

/** Is the pixel (x, y) in room space solid? Outside the room counts as open (that's a door). */
export function solidAt(tiles, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
  return tiles[ty][tx] === 1;
}

/** Does a box touch a wall? */
export function boxHits(tiles, x, y, w, h) {
  return solidAt(tiles, x, y) || solidAt(tiles, x + w - 1, y) || solidAt(tiles, x, y + h - 1) || solidAt(tiles, x + w - 1, y + h - 1);
}

/**
 * Slide a box by (dx, dy), one axis at a time, stopping at walls. Big moves
 * go in small steps so nothing can skip through a wall in one slow frame.
 */
export function moveBox(tiles, box, dx, dy) {
  let { x, y } = box;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (sx && !boxHits(tiles, x + sx, y, box.w, box.h)) x += sx;
    if (sy && !boxHits(tiles, x, y + sy, box.w, box.h)) y += sy;
  }
  return { ...box, x, y };
}

/** Walkable tiles reachable from (sx, sy), as a set of "x,y". */
export function reachable(tiles, sx, sy) {
  const seen = new Set();
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    const k = `${x},${y}`;
    if (seen.has(k) || x < 0 || y < 0 || x >= COLS || y >= ROWS || tiles[y][x] === 1) continue;
    seen.add(k);
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

/* ---------- the soul ---------- */

export const drainSoul = (soul, dt) => Math.max(0, soul - SOUL_DRAIN * dt);
export const SOUL_GAIN = { sparkle: 4, spirit: 40, boss: 50, block: 2 };
export const gainSoul = (soul, why) => Math.min(SOUL_MAX, soul + (SOUL_GAIN[why] ?? 0));

/* ---------- runs ---------- */

/** A fresh run: three hearts, a full soul, and a plain card toss. */
export function newRun(name, seed = Date.now()) {
  return {
    v: 1,
    name: cleanName(name),
    layer: 0,
    room: layoutLayer(0).start,
    hp: MAX_HEARTS * 2,
    maxHp: MAX_HEARTS * 2,
    soul: SOUL_MAX,
    tricks: { cards: null },
    equip: { a: "cards", b: null },
    beaten: LAYERS.map(() => false),
    cleared: [],     // rooms emptied of enemies, as "layer:room"
    freed: [],       // spirits that taught their trick, by trick name
    fountains: [],   // fountains already drunk, as "layer:room"
    seed,
  };
}

/** Is a saved run in one piece? A broken save starts fresh instead of crashing. */
export function validRun(r) {
  if (!r || r.v !== 1 || typeof r.name !== "string") return false;
  if (!Number.isInteger(r.layer) || r.layer < 0 || r.layer >= LAYERS.length) return false;
  const layout = layoutLayer(r.layer);
  if (!Number.isInteger(r.room) || r.room < 0 || r.room >= layout.rooms.length) return false;
  if (!(r.hp > 0 && r.hp <= r.maxHp && r.maxHp <= 12)) return false;
  if (!(r.soul > 0 && r.soul <= SOUL_MAX)) return false;
  if (!r.tricks || typeof r.tricks !== "object" || !("cards" in r.tricks)) return false;
  for (const [k, v] of Object.entries(r.tricks)) {
    if (!TRICKS[k]) return false;
    if (v !== null && !TRICKS[k].paths[v]) return false;
    if (v === null && !TRICKS[k].basic) return false;
  }
  if (!r.equip || !knows(r, r.equip.a) || (r.equip.b && !knows(r, r.equip.b))) return false;
  return Array.isArray(r.beaten) && Array.isArray(r.cleared) && Array.isArray(r.freed) && Array.isArray(r.fountains);
}

/** Beat a layer's boss: a heart container, a soul top-up, and the way down. */
export function beatBoss(run) {
  run.beaten[run.layer] = true;
  run.maxHp = Math.min(12, run.maxHp + 2);
  run.hp = run.maxHp;
  run.soul = gainSoul(run.soul, "boss");
  return run.layer === LAYERS.length - 1;
}

/** Take the ladder down to the next layer's start room. */
export function descend(run) {
  run.layer = Math.min(LAYERS.length - 1, run.layer + 1);
  run.room = layoutLayer(run.layer).start;
  return run;
}

/* ---------- small helpers ---------- */

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Eight-way facing from a stick, as a unit vector. */
export function faceFrom(x, y, prev) {
  const m = Math.hypot(x, y);
  if (m < 0.3) return prev;
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.round(Math.cos(a) * 1000) / 1000, y: Math.round(Math.sin(a) * 1000) / 1000 };
}

/** Small seeded generator so a run's rooms fill the same way each visit. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which enemies fill a room, the same every time for a given run. */
export function roomEnemies(run, layerIx, roomId) {
  const L = LAYERS[layerIx];
  const rng = makeRng((run.seed ^ (layerIx * 977 + roomId * 131)) >>> 0);
  const n = 3 + layerIx + Math.floor(rng() * 2);
  return Array.from({ length: n }, () => L.enemies[Math.floor(rng() * L.enemies.length)]);
}
