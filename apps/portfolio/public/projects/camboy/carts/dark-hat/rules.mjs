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
  spiritIntro: "{N}... I CAN'T LEAVE THIS HAT. BUT I CAN HELP YOU GET OUT.",
  spiritAttack: "PICK YOUR MAGIC ATTACK. IT GOES ON A, AND IT'S YOURS FOR THE WHOLE RUN.",
  spiritDefense: "NOW PICK A WAY TO PROTECT YOURSELF. IT GOES ON B, FOR THE WHOLE RUN.",
  spiritUpgrade: "I CAN MAKE YOUR MAGIC STRONGER. CHOOSE ONE. NO GOING BACK!",
  spiritBonus: "YOUR MAGIC IS AS STRONG AS IT GETS. LET ME MAKE YOU TOUGHER INSTEAD.",
  bossGift: "ITS DARK MAGIC SPILLS OUT... {N} CAN USE IT TO UPGRADE!",
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

/* ---------- tricks: an attack on A, a defense on B ---------- */

/**
 * Like diep.io: you pick one attack and one defense, then grow them.
 * The first spirit you meet teaches an attack, the second a defense, and
 * every spirit and boss after that upgrades what you have. Each attack and
 * defense has three tiers, and every tier is a choice between two
 * upgrades, so no two runs have to end up alike.
 *
 * Upgrades change numbers: add adds, mul multiplies, set replaces. A path
 * is permanent for the run, until you're caught or start over.
 */
export const ATTACKS = {
  cards: {
    name: "CARD TOSS",
    desc: "THE ALL-ROUNDER. KEEP IT AND GET A FREE UPGRADE NOW.",
    base: { cd: 0.32, dmg: 1, count: 1, spread: 0.28, speed: 145, pierce: false, burst: false },
    tiers: [
      [
        { id: "twin", name: "TWIN DEAL", desc: "TWO CARDS EVERY THROW.", add: { count: 1 } },
        { id: "heavy", name: "HEAVY CARD", desc: "EACH CARD HITS TWICE AS HARD, BUT THROWS A BIT SLOWER.", add: { dmg: 1 }, mul: { cd: 1.25 } },
      ],
      [
        { id: "wide", name: "WIDE FAN", desc: "TWO MORE CARDS IN A WIDER SPREAD.", add: { count: 2, spread: 0.06 } },
        { id: "quick", name: "QUICK HANDS", desc: "THROW CARDS MUCH FASTER.", mul: { cd: 0.6 } },
      ],
      [
        { id: "burst", name: "CARD BURST", desc: "EVERY THROW ALSO FLINGS CARDS IN ALL DIRECTIONS.", set: { burst: true } },
        { id: "ace", name: "ACE SNIPER", desc: "ONE FAST CARD THAT FLIES THROUGH EVERYTHING AND HITS HUGE. SLOW TO THROW.", set: { count: 1, pierce: true }, add: { dmg: 3 }, mul: { speed: 1.5, cd: 1.6 } },
      ],
    ],
  },
  wand: {
    name: "WAND WHISTLE",
    desc: "WHISTLE AND YOUR WAND HUNTS ENEMIES, THEN COMES BACK.",
    base: { cd: 2.2, dmg: 2, hits: 4, speed: 130, steer: false, wands: 1, stars: false, size: 4 },
    tiers: [
      [
        { id: "steer", name: "STEERED WAND", desc: "HOLD A AND STEER IT YOURSELF. HITS HARDER.", set: { steer: true }, add: { dmg: 1, hits: 96 } },
        { id: "hunt", name: "HUNTING WAND", desc: "IT KEEPS HUNTING AND HITS MORE ENEMIES EACH TRIP.", add: { hits: 3 } },
      ],
      [
        { id: "twin", name: "TWIN WANDS", desc: "TWO WANDS FLY OUT AT ONCE.", add: { wands: 1 } },
        { id: "swift", name: "SWIFT WAND", desc: "FLIES FASTER AND COMES BACK SOONER.", mul: { speed: 1.4, cd: 0.65 } },
      ],
      [
        { id: "stars", name: "STAR WAND", desc: "EVERY HIT BURSTS INTO LITTLE STARS.", set: { stars: true } },
        { id: "giant", name: "GIANT WAND", desc: "A BIG WAND THAT HITS VERY HARD.", add: { dmg: 3, size: 4 } },
      ],
    ],
  },
  hat: {
    name: "HAT BOOMERANG",
    desc: "THROW YOUR HAT. IT HITS GOING OUT AND COMING BACK.",
    base: { cd: 1.2, dmg: 2, size: 5, out: 0.38, hats: 1, magnet: false, grow: false, speed: 150 },
    tiers: [
      [
        { id: "magnet", name: "MAGNET HAT", desc: "PULLS SPARKLES AND HEARTS BACK TO YOU.", set: { magnet: true } },
        { id: "grow", name: "GROWING HAT", desc: "GETS BIGGER AND STRONGER WITH EVERY HIT.", set: { grow: true } },
      ],
      [
        { id: "long", name: "LONG THROW", desc: "THE HAT FLIES ALMOST TWICE AS FAR.", mul: { out: 1.8 } },
        { id: "twin", name: "TWIN HATS", desc: "THROW TWO HATS IN A V.", add: { hats: 1 } },
      ],
      [
        { id: "bigtop", name: "BIG TOP", desc: "A HUGE HAT THAT HITS HARD, BUT IT'S SLOWER TO THROW.", add: { size: 4, dmg: 2 }, mul: { cd: 1.3 } },
        { id: "rapid", name: "RAPID HATS", desc: "THROW HATS ALMOST TWICE AS OFTEN.", mul: { cd: 0.55 } },
      ],
    ],
  },
  scarf: {
    name: "SCARF WHIP",
    desc: "A QUICK, STRONG LASH UP CLOSE. HOLD A TO KEEP WHIPPING.",
    base: { cd: 0.6, dmg: 2, reach: 26, grab: false, doves: 0, spin: false, tip: false },
    tiers: [
      [
        { id: "grab", name: "GRABBING SCARF", desc: "PULLS ENEMIES IN. THEY'RE DIZZY FOR A MOMENT.", set: { grab: true } },
        { id: "doves", name: "DOVE SCARF", desc: "DOVES BURST FROM THE TIP AND CHASE ENEMIES.", add: { doves: 3 } },
      ],
      [
        { id: "long", name: "LONG SCARF", desc: "REACHES MUCH FARTHER.", add: { reach: 14 } },
        { id: "quick", name: "QUICK SCARF", desc: "WHIP MUCH FASTER.", mul: { cd: 0.6 } },
      ],
      [
        { id: "spin", name: "SPIN SCARF", desc: "WHIPS ALL THE WAY AROUND YOU.", set: { spin: true } },
        { id: "tip", name: "MAGIC TIP", desc: "THE TIP SHOOTS A BOLT OF MAGIC STRAIGHT AHEAD.", set: { tip: true } },
      ],
    ],
  },
};

export const DEFENSES = {
  shield: {
    name: "CARD SHIELD",
    desc: "CARDS CIRCLE YOU, ROOM TO ROOM. EACH BLOCKS OR HITS ONCE.",
    base: { cd: 8, cards: 3, radius: 14, dmg: 1, tough: 1, reflect: false },
    tiers: [
      [
        { id: "four", name: "FOURTH CARD", desc: "FOUR CARDS INSTEAD OF THREE.", add: { cards: 1 } },
        { id: "fast", name: "FAST DEAL", desc: "YOUR CARDS COME BACK MUCH SOONER.", mul: { cd: 0.55 } },
      ],
      [
        { id: "wide", name: "WIDE CIRCLE", desc: "CARDS CIRCLE FARTHER OUT AND HIT HARDER.", add: { radius: 6, dmg: 1 } },
        { id: "steel", name: "STEEL CARDS", desc: "EACH CARD BLOCKS TWO HITS INSTEAD OF ONE.", add: { tough: 1 } },
      ],
      [
        { id: "fortress", name: "CARD FORTRESS", desc: "TWO MORE CARDS IN THE CIRCLE.", add: { cards: 2 } },
        { id: "reflect", name: "RETURN TO SENDER", desc: "SHOTS YOUR CARDS BLOCK FLY BACK AT ENEMIES.", set: { reflect: true } },
      ],
    ],
  },
  blink: {
    name: "VANISH",
    desc: "DISAPPEAR AND REAPPEAR AHEAD, RIGHT THROUGH ENEMIES.",
    base: { cd: 1.6, far: 44, safe: 0.4, charges: 1, trail: false, smoke: false },
    tiers: [
      [
        { id: "far", name: "FAR BLINK", desc: "VANISH HALF AGAIN AS FAR.", mul: { far: 1.5 } },
        { id: "quick", name: "QUICK BLINK", desc: "VANISH AGAIN MUCH SOONER.", mul: { cd: 0.55 } },
      ],
      [
        { id: "trail", name: "SPARK TRAIL", desc: "HURTS EVERY ENEMY YOU VANISH THROUGH.", set: { trail: true } },
        { id: "fade", name: "LONG FADE", desc: "STAY SAFE LONGER AFTER YOU REAPPEAR.", add: { safe: 0.6 } },
      ],
      [
        { id: "double", name: "DOUBLE BLINK", desc: "VANISH TWICE IN A ROW BEFORE THE WAIT.", add: { charges: 1 } },
        { id: "smoke", name: "SMOKE BOMB", desc: "ENEMIES NEAR WHERE YOU LEAVE AND LAND GET DIZZY.", set: { smoke: true } },
      ],
    ],
  },
  decoy: {
    name: "RABBIT DECOY",
    desc: "HOP AWAY AND LEAVE A RABBIT. ENEMIES CHASE IT INSTEAD.",
    base: { cd: 4, time: 3, hop: 22, bunnies: 1, boom: false, sparkle: false },
    tiers: [
      [
        { id: "lasting", name: "LASTING RABBIT", desc: "THE RABBIT STAYS MUCH LONGER.", add: { time: 2.5 } },
        { id: "quick", name: "QUICK RABBIT", desc: "MAKE A NEW RABBIT MUCH SOONER.", mul: { cd: 0.55 } },
      ],
      [
        { id: "boom", name: "BOOM BUNNY", desc: "THE RABBIT GOES BOOM WHEN IT'S DONE.", set: { boom: true } },
        { id: "two", name: "TWO BUNNIES", desc: "LEAVE TWO RABBITS AT ONCE.", add: { bunnies: 1 } },
      ],
      [
        { id: "hop", name: "BIG HOP", desc: "HOP TWICE AS FAR AWAY.", mul: { hop: 2 } },
        { id: "lucky", name: "LUCKY RABBIT", desc: "EVERY RABBIT LEAVES A SPARKLE BEHIND.", set: { sparkle: true } },
      ],
    ],
  },
  storm: {
    name: "CARD STORM",
    desc: "CARDS BURST OUT IN A RING ALL AROUND YOU.",
    base: { cd: 2.6, cards: 10, dmg: 1, push: 0, life: 0.55, spin: false, drink: false },
    tiers: [
      [
        { id: "gust", name: "GUST STORM", desc: "THE BURST SHOVES ENEMIES AWAY.", add: { push: 24 } },
        { id: "thick", name: "THICK STORM", desc: "SIX MORE CARDS IN THE RING.", add: { cards: 6 } },
      ],
      [
        { id: "quick", name: "QUICK STORM", desc: "BURST AGAIN MUCH SOONER.", mul: { cd: 0.6 } },
        { id: "sharp", name: "SHARP STORM", desc: "EVERY CARD HITS TWICE AS HARD.", add: { dmg: 1 } },
      ],
      [
        { id: "cyclone", name: "CYCLONE", desc: "THE CARDS SPIN AS THEY FLY, TWICE AS FAR.", mul: { life: 2 }, set: { spin: true } },
        { id: "drink", name: "DRINKING STORM", desc: "CARDS THAT HIT SPARKS FILL YOUR SOUL.", set: { drink: true } },
      ],
    ],
  },
};

/** When everything you have is fully upgraded, a spirit makes you tougher instead. */
export const BONUSES = [
  { id: "heart", name: "BIGGER HEART", desc: "ONE MORE HEART, AND HEAL ALL THE WAY." },
  { id: "soul", name: "DEEP SOUL", desc: "YOUR SOUL DRAINS MORE SLOWLY." },
];

export const TIERS = 3;

/** The numbers for an attack or defense with its upgrades applied, in the order taken. */
export function statsOf(entry, catalog) {
  const t = catalog[entry.id];
  const st = { ...t.base };
  entry.ups.forEach((upId, tier) => {
    const up = t.tiers[tier].find((u) => u.id === upId);
    for (const [k, v] of Object.entries(up.add || {})) st[k] += v;
    for (const [k, v] of Object.entries(up.mul || {})) st[k] *= v;
    for (const [k, v] of Object.entries(up.set || {})) st[k] = v;
  });
  return st;
}
export const attackStats = (run) => statsOf(run.attack, ATTACKS);
export const defenseStats = (run) => (run.defense ? statsOf(run.defense, DEFENSES) : null);

/** The name of what you have, with its latest upgrade: "CARD TOSS: TWIN DEAL". */
export function upgradeNames(entry, catalog) {
  return entry.ups.map((u, tier) => catalog[entry.id].tiers[tier].find((x) => x.id === u).name);
}

/**
 * What a spirit or a beaten boss offers right now. Spirits teach an attack
 * first and a defense second. After that, and from every boss, you upgrade
 * whichever of the two has had fewer upgrades (the attack wins a tie), so
 * they grow together. Skip the defense spirit and every upgrade goes to
 * your attack. Once all of it is maxed, the choice is a bigger heart or a
 * deeper soul.
 */
export function nextPick(run, source) {
  if (source === "spirit" && !run.attack.picked) return { type: "attack", options: Object.keys(ATTACKS) };
  if (source === "spirit" && !run.defense) return { type: "defense", options: Object.keys(DEFENSES) };
  const trees = [["attack", run.attack, ATTACKS]];
  if (run.defense) trees.push(["defense", run.defense, DEFENSES]);
  const open = trees.filter(([, e]) => e.ups.length < TIERS);
  if (!open.length) return { type: "bonus", options: BONUSES.map((b) => b.id) };
  open.sort((a, b) => a[1].ups.length - b[1].ups.length);
  const [tree, entry, cat] = open[0];
  return { type: "upgrade", tree, options: cat[entry.id].tiers[entry.ups.length].map((u) => u.id) };
}

/** The name and description of each option in a pick, for the choice screen. */
export function describePick(run, pick) {
  if (pick.type === "attack") return pick.options.map((id) => ({ name: ATTACKS[id].name, desc: ATTACKS[id].desc }));
  if (pick.type === "defense") return pick.options.map((id) => ({ name: DEFENSES[id].name, desc: DEFENSES[id].desc }));
  if (pick.type === "bonus") return pick.options.map((id) => BONUSES.find((b) => b.id === id));
  const entry = run[pick.tree];
  const cat = pick.tree === "attack" ? ATTACKS : DEFENSES;
  return cat[entry.id].tiers[entry.ups.length].map((u) => ({ name: u.name, desc: u.desc }));
}

/**
 * Take option i of a pick. Returns "extra" when keeping the card toss earns
 * a free upgrade right away, true when the pick took, false otherwise.
 */
export function applyPick(run, pick, i) {
  const id = pick.options[i];
  if (id == null) return false;
  if (pick.type === "attack") {
    if (run.attack.picked) return false;
    if (id === "cards") { run.attack.picked = true; return "extra"; }
    run.attack = { id, ups: [], picked: true };
    return true;
  }
  if (pick.type === "defense") {
    if (run.defense) return false;
    run.defense = { id, ups: [] };
    return true;
  }
  if (pick.type === "bonus") {
    if (id === "heart") { run.maxHp = Math.min(12, run.maxHp + 2); run.hp = run.maxHp; }
    else run.deep = Math.min(3, (run.deep || 0) + 1);
    return true;
  }
  const entry = run[pick.tree];
  if (!entry || entry.ups.length >= TIERS) return false;
  entry.ups.push(id);
  return true;
}

/* ---------- the hat's layers ---------- */

/**
 * Each layer is a grid of rooms. S start, E enemies, P a trapped spirit,
 * F a soul fountain, B the boss. What a spirit teaches depends on what
 * you already have: see nextPick.
 */
export const LAYERS = [
  {
    name: "THE VELVET BRIM",
    grid: ["S E P", "E F E", "P E B"],
    enemies: ["spark", "glove", "bunny"],
    boss: "rabbit",
  },
  {
    name: "CARD CATACOMBS",
    grid: ["S E P", "P E E", "E P B"],
    enemies: ["spark", "soldier", "glove", "wisp"],
    boss: "king",
  },
  {
    name: "THE BOTTOM",
    grid: ["S P", "F B"],
    enemies: ["spark", "soldier", "wisp"],
    boss: "malvado",
  },
];

/**
 * The Giant Rabbit's hop and the shockwave ring it makes landing. He hops
 * at most `hop` pixels toward you, so his shadow never lands too far to run
 * from, and the ring stops at `ring`, so getting clear of it is possible.
 */
export const RABBIT = { hop: 46, air: 0.9, airFast: 0.8, ring: 34, ringSpeed: 60 };

/** Where the rabbit lands: toward you, but never more than one hop away. */
export function rabbitLanding(from, toward, hop = RABBIT.hop) {
  const d = Math.hypot(toward.x - from.x, toward.y - from.y);
  if (d <= hop) return { x: toward.x, y: toward.y };
  return { x: from.x + ((toward.x - from.x) / d) * hop, y: from.y + ((toward.y - from.y) / d) * hop };
}

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

/** deep is how many Deep Soul bonuses you have: each makes the soul drain a fifth slower. */
export const drainSoul = (soul, dt, deep = 0) => Math.max(0, soul - SOUL_DRAIN * 0.8 ** deep * dt);
export const SOUL_GAIN = { sparkle: 4, spirit: 40, boss: 50, block: 2 };
export const gainSoul = (soul, why) => Math.min(SOUL_MAX, soul + (SOUL_GAIN[why] ?? 0));

/* ---------- runs ---------- */

/** A fresh run: three hearts, a full soul, and a plain card toss. */
export function newRun(name, seed = Date.now()) {
  return {
    v: 2,
    name: cleanName(name),
    layer: 0,
    room: layoutLayer(0).start,
    hp: MAX_HEARTS * 2,
    maxHp: MAX_HEARTS * 2,
    soul: SOUL_MAX,
    attack: { id: "cards", ups: [], picked: false }, // A: a plain card toss until a spirit says otherwise
    defense: null,                                    // B: nothing until the second spirit
    deep: 0,         // Deep Soul bonuses taken
    beaten: LAYERS.map(() => false),
    cleared: [],     // rooms emptied of enemies, as "layer:room"
    freed: [],       // spirits already met, as "layer:room"
    fountains: [],   // fountains already drunk, as "layer:room"
    seed,
  };
}

/** Is an attack or defense entry real: a known id, and upgrades that exist in order? */
function validEntry(e, catalog) {
  if (!e || !catalog[e.id] || !Array.isArray(e.ups) || e.ups.length > TIERS) return false;
  return e.ups.every((u, tier) => catalog[e.id].tiers[tier].some((x) => x.id === u));
}

/**
 * Is a saved run in one piece? A broken save, or one from before attacks
 * and defenses, starts fresh instead of crashing.
 */
export function validRun(r) {
  if (!r || r.v !== 2 || typeof r.name !== "string") return false;
  if (!Number.isInteger(r.layer) || r.layer < 0 || r.layer >= LAYERS.length) return false;
  const layout = layoutLayer(r.layer);
  if (!Number.isInteger(r.room) || r.room < 0 || r.room >= layout.rooms.length) return false;
  if (!(r.hp > 0 && r.hp <= r.maxHp && r.maxHp <= 12)) return false;
  if (!(r.soul > 0 && r.soul <= SOUL_MAX)) return false;
  if (!validEntry(r.attack, ATTACKS) || typeof r.attack.picked !== "boolean") return false;
  if (r.defense !== null && !validEntry(r.defense, DEFENSES)) return false;
  if (!(Number.isInteger(r.deep) && r.deep >= 0 && r.deep <= 3)) return false;
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
