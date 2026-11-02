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
export const SOUL_DRAIN = 0.75;      // per second: a full soul lasts a bit over two minutes
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
  castleIntro: [
    "MALVADO: WELL, WELL, WELL. {N} BEAT MY CARD KING! NOBODY BEATS MY CARD KING.",
    "MALVADO: YOUR SOUL WOULD MAKE A SPECTACULAR TRICK. LET'S SEE HOW YOU DO IN A WHOLE NEW GAME...",
    "MALVADO: ABRA... KADABRA... FLAT!",
  ],
  castleLand: [
    "{N}: WHY IS EVERYTHING... FLAT?",
    "UP JUMPS, CLIMBS LADDERS AND OPENS DOORS. DOWN DROPS THROUGH LEDGES. A AND B STILL WORK!",
  ],
  castleBoss: "MALVADO: MEET MY RABBIT. HE'S FLAT NOW TOO!",
  castleNext: "THE FAR DOOR OF THE THRONE ROOM CREAKS OPEN. SOMETHING IN THERE IS SHUFFLING CARDS...",
  castleKing: "MALVADO: MY CARD KING IS BACK, AND FLATTER THAN EVER!",
  castleDoor: "A DOOR APPEARS AT THE END OF THE CARD HALL. THE WAY OUT OF THE CASTLE!",
  castleExit: [
    "MALVADO: WHAT?! NOBODY GETS OUT OF MY CASTLE!",
    "MALVADO: FINE. BACK INTO THE HAT WITH YOU!",
  ],
  castleBack: "{N}: THAT WAS WEIRD. I WAS FLAT.",
  fallIntro: "...AND NOW {N} IS FALLING! DOWN, DOWN, TO THE VERY BOTTOM OF THE HAT!",
  fallHelp: "LEFT AND RIGHT TO STEER. A SHOOTS CARDS DOWN AND SLOWS YOUR FALL. STOMP GLOVES AND BUNNIES. SHOOT THE SPARKS!",
  slideIntro: "THE LADDER ENDS AT THE TOP OF A LONG VELVET SLOPE. MALVADO'S DARK MAGIC POURS IN BEHIND {N}!",
  slideHelp: "SLIDE ON YOUR HAT! HOLD A OR DOWN TO DIVE INTO THE HILLS. LET GO TO FLY OFF THE TOPS. OUTRUN THE DARK!",
  slideCaught: "THE DARK MAGIC CAUGHT {N}! IT COSTS A HEART. BACK TO THE TOP OF THE SLOPE!",
  flightIntro: [
    "MALVADO'S HAT SHAKES. THE DARK MAGIC IS BREAKING!",
    "A MAGIC SCARF UNROLLS FROM THE TOP OF THE HAT. {N} GRABS ON, AND IT FLIES!",
    "MALVADO: COME BACK HERE! YOU'RE MY BEST TRICK!",
  ],
  flightHelp: "FLY OUT OF THE HAT! STEER TO DODGE. HIT MALVADO TO KNOCK HIM BACK. DON'T LET HIM CATCH YOU!",
  flightCaught: "MALVADO GRABBED THE END OF THE SCARF! BACK TO THE BOTTOM. TRY AGAIN!",
  escape: [
    "{N} SHOOTS OUT OF THE HAT ON THE MAGIC SCARF AND LANDS ON THE STAGE. THE CROWD GOES WILD.",
    "MALVADO'S HAT CRUMPLES. EVERY SPIRIT INSIDE FLOATS OUT, FREE AT LAST.",
    "MALVADO'S SHOW IS OVER. {N} ESCAPED THE DARK HAT!",
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
    desc: "WHISTLE: YOUR WAND FLIES TO AN ENEMY, HITS IT AND COMES BACK.",
    // One hit per trip, and no new whistle until it's back in your hand.
    base: { cd: 0.4, dmg: 2, hits: 1, speed: 130, steer: false, wands: 1, stars: false, size: 4 },
    tiers: [
      [
        { id: "steer", name: "STEERED WAND", desc: "HOLD A TO STEER IT YOURSELF. IT HITS HARDER, UP TO THREE TIMES.", set: { steer: true }, add: { dmg: 1, hits: 2 } },
        { id: "hunt", name: "HUNTING WAND", desc: "IT HUNTS ONE MORE ENEMY BEFORE IT COMES BACK.", add: { hits: 1 } },
      ],
      [
        { id: "twin", name: "TWIN WANDS", desc: "TWO WANDS FLY OUT AT ONCE.", add: { wands: 1 } },
        { id: "swift", name: "SWIFT WAND", desc: "FLIES FASTER AND COMES BACK SOONER.", mul: { speed: 1.4, cd: 0.65 } },
      ],
      [
        { id: "stars", name: "STAR WAND", desc: "EVERY HIT BURSTS INTO LITTLE STARS.", set: { stars: true } },
        { id: "giant", name: "GIANT WAND", desc: "A BIG WAND THAT HITS VERY HARD.", add: { dmg: 2, size: 4 } },
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
    if (id === "heart") { run.maxHp = Math.min(12, run.maxHp + 2); run.hp = run.maxHp; run.hearts = (run.hearts || 0) + 1; }
    else run.deep = Math.min(3, (run.deep || 0) + 1);
    return true;
  }
  const entry = run[pick.tree];
  if (!entry || entry.ups.length >= TIERS) return false;
  entry.ups.push(id);
  return true;
}

/* ---------- the spell book ---------- */

/**
 * Every path and upgrade, for the spell book. A node's key is "a:cards" for
 * a path or "a:cards:twin" for one of its upgrades ("d:" for defenses).
 * Path names always show, so you know what exists; an upgrade stays "???"
 * until you've taken it once, in any run. Flip SHOW_ALL to reveal them all.
 */
export const SHOW_ALL = false;

export const bookPaths = () => [
  ...Object.entries(ATTACKS).map(([id, p]) => ({ kind: "a", id, ...p })),
  ...Object.entries(DEFENSES).map(([id, p]) => ({ kind: "d", id, ...p })),
];

export const nodeKey = (kind, id, upId = null) => (upId ? `${kind}:${id}:${upId}` : `${kind}:${id}`);

/** Every key in the book: 8 paths and their 48 upgrades. */
export const allNodeKeys = () => bookPaths().flatMap((p) => [nodeKey(p.kind, p.id), ...p.tiers.flat().map((u) => nodeKey(p.kind, p.id, u.id))]);

/**
 * The build a "try it" demo uses for a node: the path, plus the upgrade on
 * the same side of the tree at every tier up to the chosen one. tier -1 is
 * the plain path.
 */
export function demoBuild(path, tier, col) {
  const ups = [];
  for (let t = 0; t <= tier; t++) ups.push(path.tiers[t][col].id);
  return { id: path.id, ups, picked: true };
}

/** Which book keys a pick unlocks. Bonuses aren't in the book. */
export function keysForPick(run, pick, i) {
  const id = pick.options[i];
  if (pick.type === "attack") return [nodeKey("a", id)];
  if (pick.type === "defense") return [nodeKey("d", id)];
  if (pick.type === "upgrade") {
    const kind = pick.tree === "attack" ? "a" : "d";
    return [nodeKey(kind, run[pick.tree].id, id)];
  }
  return [];
}

/* ---------- the hat's layers ---------- */

/**
 * Each layer is a grid of rooms. S start, E enemies, P a trapped spirit,
 * F a soul fountain, B the boss. What a spirit teaches depends on what
 * you already have: see nextPick.
 *
 * Malvado's Castle is different: he zaps you into a flat, side-on game of
 * his own (see CASTLE). depth is how deep a layer counts for enemies.
 */
export const LAYERS = [
  {
    name: "THE VELVET BRIM",
    grid: ["S E P", "E F E", "P E B"],
    enemies: ["spark", "glove", "bunny"],
    boss: "rabbit",
    look: 0, depth: 0,
    down: "slide", // its ladder drops you onto the hat slide
  },
  {
    name: "CARD CATACOMBS",
    grid: ["S E P", "P E E", "E P B"],
    enemies: ["spark", "soldier", "glove", "wisp"],
    boss: "king",
    look: 1, depth: 1,
  },
  {
    name: "MALVADO'S CASTLE",
    side: true,
    ground: ["bunny", "soldier"],
    air: ["spark", "spark", "glove", "wisp"],
    enemies: ["bunny", "soldier", "spark", "glove", "wisp"],
    boss: "flatking", // and the flat rabbit before him: see CASTLE
    depth: 2,
  },
  {
    name: "THE BOTTOM",
    grid: ["S P", "F B"],
    enemies: ["spark", "soldier", "wisp"],
    boss: "malvado",
    look: 2, depth: 2,
  },
];

/** Which layer is the castle: the one Malvado swaps cartridges for. */
export const CASTLE_LAYER = LAYERS.findIndex((L) => L.side);

/**
 * Malvado's Castle, seen from the side. Every room is 16 tiles tall and
 * at least a screen wide; the wide ones scroll.
 *
 *   #  stone       =  a ledge you can jump up through and stand on
 *   H  ladder      ^  spikes
 *   s  where you start          P  a trapped spirit      F  a soul fountain
 *   1  a walker (bunny or soldier)    2  a flier (spark, glove or wisp)
 *   a to h  a door: the letter is its bottom-left tile, and it is two
 *           tiles wide and three tall. Each letter joins two rooms.
 *   x  the way out, which opens once the boss is beaten
 */
export const CASTLE = [
  {
    name: "THE GATE", kind: "start",
    map: [
      "##############################",
      "#............................#",
      "#............................#",
      "#............................#",
      "#............................#",
      "#............................#",
      "#..................2.........#",
      "#............................#",
      "#..............=====.........#",
      "#............................#",
      "#.........====...............#",
      "#....................2.......#",
      "#.....===...........####.....#",
      "#...................####.....#",
      "#.s........1........####..a..#",
      "##############################",
    ],
  },
  {
    name: "THE GREAT HALL", kind: "enemy",
    map: [
      "##############################",
      "#............................#",
      "#............................#",
      "#.....b......................#",
      "#....######H.................#",
      "#..........H.................#",
      "#..........H.........2.......#",
      "#..........H.................#",
      "#..........H......=====......#",
      "#..........H.................#",
      "#..........H.............===.#",
      "#..........H.................#",
      "#..........H..........2......#",
      "#..........H.................#",
      "#.a........H.......1......c..#",
      "##############################",
    ],
  },
  {
    name: "THE TOWER", kind: "spirit",
    map: [
      "####################",
      "#..................#",
      "#..................#",
      "#...P..............#",
      "#..====............#",
      "#..................#",
      "#........====......#",
      "#..................#",
      "#.............====.#",
      "#..................#",
      "#........====....2.#",
      "#..................#",
      "#....====..........#",
      "#..................#",
      "#.b..........1.....#",
      "####################",
    ],
  },
  {
    name: "THE LIBRARY", kind: "fountain",
    map: [
      "##############################",
      "#............................#",
      "#............................#",
      "#........2...........2.......#",
      "#............................#",
      "#............................#",
      "#...........H####............#",
      "#...........H####............#",
      "#...........H####............#",
      "#...........H####===.........#",
      "#...........H####............#",
      "#...........H####............#",
      "#....===....H####..===.......#",
      "#...........H####............#",
      "#.c.....1...H####......F..d..#",
      "##############################",
    ],
  },
  {
    name: "THE SPIKE STAIRS", kind: "enemy",
    map: [
      "########################################",
      "#......................................#",
      "#......................................#",
      "#......................................#",
      "#......................................#",
      "#..........2...........2.........2.....#",
      "#......................................#",
      "#......................................#",
      "#......................................#",
      "#...........===.............===........#",
      "#......................................#",
      "#.......===....===.......===...===.....#",
      "#......................................#",
      "#......................................#",
      "#.d.......^^^^^^....1....^^^^^^....1.e.#",
      "########################################",
    ],
  },
  {
    name: "THE THRONE ROOM", kind: "boss",
    map: [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..===........===..#",
      "#..................#",
      "#..................#",
      "#.e.............f..#",
      "####################",
    ],
    boss: "flatrabbit",
  },
  {
    name: "THE CARD HALL", kind: "boss",
    map: [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..===........===..#",
      "#..................#",
      "#..................#",
      "#.f.............x..#",
      "####################",
    ],
    boss: "flatking",
  },
];

/* Tile codes in a castle room. */
export const T_AIR = 0, T_WALL = 1, T_LEDGE = 2, T_LADDER = 3, T_SPIKES = 4;

/** A castle room's tiles, as codes. Markers (doors, spots) are open air. */
export function castleTiles(room) {
  const code = { "#": T_WALL, "=": T_LEDGE, H: T_LADDER, "^": T_SPIKES };
  return room.map.map((row) => [...row].map((ch) => code[ch] ?? T_AIR));
}

/** Read the castle's maps into rooms, with doors joined up by letter. */
function layoutCastle() {
  const rooms = CASTLE.map((c, id) => {
    const room = { id, name: c.name, kind: c.kind, boss: c.boss || null, side: true, map: c.map, cols: c.map[0].length, doors: [], spots: [], start: null, spirit: null, fountain: null };
    c.map.forEach((row, ty) => [...row].forEach((ch, tx) => {
      const x = tx * TILE + TILE / 2, foot = (ty + 1) * TILE;
      if (/[a-hx]/.test(ch)) room.doors.push({ id: ch, tx, ty, x: tx * TILE + TILE, foot });
      else if (ch === "s") room.start = { x, y: foot - 5 };
      else if (ch === "P") room.spirit = { x, y: foot - 4 };
      else if (ch === "F") room.fountain = { x, y: foot - 4 };
      else if (ch === "1") room.spots.push({ type: "ground", x, y: foot - 3 });
      else if (ch === "2") room.spots.push({ type: "air", x, y: ty * TILE + TILE / 2 });
    }));
    return room;
  });
  for (const room of rooms) for (const d of room.doors) {
    if (d.id === "x") { d.to = null; continue; }
    const other = rooms.find((r) => r !== room && r.doors.some((k) => k.id === d.id));
    d.to = other ? other.id : null;
  }
  // The castle's last boss is the one with the way out.
  const last = rooms.find((r) => r.doors.some((d) => d.id === "x"));
  return { side: true, cols: rooms.length, rows: 1, rooms, start: rooms.find((r) => r.kind === "start").id, boss: last.id };
}

/** Which walkers and fliers fill a castle room, the same every visit. */
export function castleEnemies(run, layerIx, room) {
  const L = LAYERS[layerIx];
  const rng = makeRng((run.seed ^ (layerIx * 977 + room.id * 131)) >>> 0);
  return room.spots.map((s) => {
    const pool = s.type === "ground" ? L.ground : L.air;
    return { kind: pool[Math.floor(rng() * pool.length)], x: s.x, y: s.y };
  });
}

/* ---------- moving in the castle: gravity, ledges and ladders ---------- */

/**
 * Side-on movement, in pixels and seconds. A jump rises about five tiles
 * and carries about five across; letting go of Up early makes a short hop.
 */
export const SIDE = { gravity: 560, jump: 215, cut: 90, walk: 52, climb: 44, fall: 230, coyote: 0.08, buffer: 0.12 };

/** The tile code at (tx, ty). Off the sides and bottom is wall; above the top is air. */
export function tileAt(tiles, tx, ty) {
  if (ty < 0) return T_AIR;
  if (ty >= tiles.length || tx < 0 || tx >= tiles[0].length) return T_WALL;
  return tiles[ty][tx];
}

/** Can you stand on top of this tile? Walls, ledges, and the top rung of a ladder. */
export function standsOn(tiles, tx, ty) {
  const t = tileAt(tiles, tx, ty);
  return t === T_WALL || t === T_LEDGE || (t === T_LADDER && tileAt(tiles, tx, ty - 1) !== T_LADDER);
}

/** The tiles a box (centered at x, y) covers. */
function span(b, x, y) {
  return {
    x0: Math.floor((x - b.w / 2) / TILE), x1: Math.floor((x + b.w / 2 - 0.001) / TILE),
    y0: Math.floor((y - b.h / 2) / TILE), y1: Math.floor((y + b.h / 2 - 0.001) / TILE),
  };
}
function hitsWall(tiles, b, x, y) {
  const s = span(b, x, y);
  for (let ty = s.y0; ty <= s.y1; ty++) for (let tx = s.x0; tx <= s.x1; tx++) if (tileAt(tiles, tx, ty) === T_WALL) return true;
  return false;
}
/** Does the box touch a tile of this kind? */
export function touches(tiles, b, kind) {
  const s = span(b, b.x, b.y);
  for (let ty = s.y0; ty <= s.y1; ty++) for (let tx = s.x0; tx <= s.x1; tx++) if (tileAt(tiles, tx, ty) === kind) return true;
  return false;
}

/**
 * Move a box (centered at b.x, b.y, size b.w by b.h) by (dx, dy) in small
 * steps. Walls stop it from every side; ledges and ladder tops only stop
 * it falling onto them, unless it's dropping through.
 */
export function sideMove(tiles, b, dx, dy, drop = false) {
  let { x, y } = b;
  let hitX = false, landed = false, bonk = false;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (sx && !hitX) { if (hitsWall(tiles, b, x + sx, y)) hitX = true; else x += sx; }
    if (sy < 0 && !bonk) { if (hitsWall(tiles, b, x, y + sy)) bonk = true; else y += sy; }
    if (sy > 0 && !landed) {
      const feet = y + b.h / 2, next = feet + sy;
      if (hitsWall(tiles, b, x, y + sy)) { y = Math.floor(next / TILE) * TILE - b.h / 2; landed = true; continue; }
      const row = Math.floor(next / TILE);
      if (!drop && feet <= row * TILE && next > row * TILE) {
        const s = span(b, x, y);
        for (let tx = s.x0; tx <= s.x1; tx++) if (standsOn(tiles, tx, row)) { landed = true; break; }
        if (landed) { y = row * TILE - b.h / 2; continue; }
      }
      y += sy;
    }
  }
  return { x, y, hitX, landed, bonk };
}

/** Is the box on a ladder tile, by its middle? */
const onLadder = (tiles, x, y) => tileAt(tiles, Math.floor(x / TILE), Math.floor(y / TILE)) === T_LADDER;

/**
 * One step of the hero in the castle. ctl is { x: -1, 0 or 1, up, down
 * (held), jump, downPressed (this frame) }. b carries x, y, w, h, vx, vy,
 * ground, climb and a few timers. Returns what happened this step.
 */
export function sideStep(tiles, b, ctl, dt) {
  const ev = { jumped: false, landed: false, spikes: false };
  const feet = () => b.y + b.h / 2;
  b.coyote = b.ground ? SIDE.coyote : Math.max(0, (b.coyote || 0) - dt);
  b.buffer = ctl.jump ? SIDE.buffer : Math.max(0, (b.buffer || 0) - dt);
  b.dropT = Math.max(0, (b.dropT || 0) - dt);

  // Grab a ladder: Up in front of one, or Down standing on its top.
  if (!b.climb) {
    if (ctl.up && onLadder(tiles, b.x, b.y)) b.climb = true;
    else if (ctl.down && b.ground && onLadder(tiles, b.x, feet() + 1)) { b.climb = true; b.y += 2; }
    if (b.climb) { b.x = Math.floor(b.x / TILE) * TILE + TILE / 2; b.vx = 0; b.vy = 0; b.buffer = 0; b.ground = false; }
  }

  if (b.climb) {
    const dir = (ctl.down ? 1 : 0) - (ctl.up ? 1 : 0);
    if (ctl.x && !dir) { b.climb = false; b.vx = ctl.x * SIDE.walk; } // step off sideways
    else {
      const m = sideMove(tiles, b, 0, dir * SIDE.climb * dt, true);
      b.y = m.y;
      if (dir < 0 && !onLadder(tiles, b.x, feet() - 0.5)) {
        // Off the top: stand on it.
        b.y = Math.ceil(feet() / TILE) * TILE - b.h / 2;
        b.climb = false; b.ground = true; b.vy = 0;
      } else if (m.landed || (dir > 0 && !onLadder(tiles, b.x, b.y) && !onLadder(tiles, b.x, feet() + 1))) {
        b.climb = false; b.ground = m.landed;
      }
      return ev;
    }
  }

  b.vx = ctl.x * SIDE.walk;
  if (ctl.downPressed && b.ground && !onLadder(tiles, b.x, feet() + 1)) {
    // Only ledges can be dropped through, not stone.
    const s = span(b, b.x, b.y);
    let ledge = true;
    for (let tx = s.x0; tx <= s.x1; tx++) if (tileAt(tiles, tx, Math.floor((feet() + 1) / TILE)) === T_WALL) ledge = false;
    if (ledge) { b.dropT = 0.22; b.ground = false; b.coyote = 0; }
  }
  if (b.buffer > 0 && b.coyote > 0) {
    b.vy = -SIDE.jump; b.buffer = 0; b.coyote = 0; b.ground = false; ev.jumped = true;
  }
  if (!ctl.up && b.vy < -SIDE.cut) b.vy = -SIDE.cut;
  b.vy = Math.min(SIDE.fall, b.vy + SIDE.gravity * dt);
  const m = sideMove(tiles, b, b.vx * dt, b.vy * dt, b.dropT > 0);
  b.x = m.x; b.y = m.y;
  if (m.landed) { if (!b.ground) ev.landed = true; b.ground = true; b.vy = 0; }
  else if (b.vy > 0) b.ground = false;
  if (m.bonk) b.vy = 0;
  ev.spikes = touches(tiles, b, T_SPIKES);
  return ev;
}

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
  flatrabbit: { name: "THE FLAT RABBIT", hp: 24 },
  flatking: { name: "THE FLAT CARD KING", hp: 26 },
  malvado: { name: "THE GREAT MALVADO", hp: 40 },
};

export const ENEMIES = {
  dummy: { hp: 3, speed: 0, touch: 0 },   // straw targets in the spell book's practice room
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
  if (L.side) return layoutCastle();
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
  if (tx < 0 || ty < 0 || tx >= tiles[0].length || ty >= tiles.length) return false;
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

/* ---------- the hat slide: a velvet hillside, with the dark behind you ---------- */

/**
 * After the Velvet Brim, the ladder drops you at the top of a long slope
 * of hat lining. You ride your hat down it. Holding dive pulls you into
 * the ground: do it going downhill to pick up speed, let go going uphill
 * to fly off the tops. Land lined up with a downslope for a boost, land
 * badly and you lose speed. The dark magic behind you speeds up.
 */
export const SLIDE = {
  length: 2800,        // pixels to the bottom
  gravity: 320, dive: 3.2,
  minSpeed: 30, maxSpeed: 250, drag: 0.1,
  nice: 1.15, oof: 0.72,
  darkStart: -120, darkSpeed: 58, darkGain: 36, // the dark's speed at the top, and how much it gains by the bottom
};

/** Height of the ground (in room pixels, down is bigger) at x. Hills get bigger further down. */
export function slideGround(x) {
  if (x < 0) return slideGround(0);
  const amp = 18 + 10 * Math.min(1, x / 1600) + 4 * Math.sin(x / 530);
  const phase = (x / 150 + 0.12 * Math.sin(x / 700)) * Math.PI * 2;
  return 84 - amp * Math.cos(phase);
}
export const slideSlope = (x) => slideGround(x + 0.5) - slideGround(x - 0.5);

/** One step of the hat sled. b has x, y, vx, vy, ground. Returns what happened. */
export function slideStep(b, dive, dt) {
  const ev = { landed: false, nice: false, oof: false };
  const was = b.ground;
  b.vy += SLIDE.gravity * (dive ? SLIDE.dive : 1) * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const gy = slideGround(b.x);
  if (b.y >= gy) {
    const m = slideSlope(b.x), len = Math.hypot(1, m), tx = 1 / len, ty = m / len;
    let along = b.vx * tx + b.vy * ty;
    if (!was) {
      // How well did the fall line up with the hill?
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const align = along / sp;
      if (m > 0.15 && align > 0.93) { along *= SLIDE.nice; ev.nice = true; }
      else if (align < 0.75) { along *= SLIDE.oof; ev.oof = true; }
      ev.landed = true;
    }
    along *= 1 - SLIDE.drag * dt;
    const v = Math.max(SLIDE.minSpeed, Math.min(SLIDE.maxSpeed, along));
    b.vx = v * tx; b.vy = v * ty; b.y = gy; b.ground = true;
  } else if (b.y < gy - 1) b.ground = false;
  return ev;
}

/** How fast the dark comes on, by how far down the hero is. */
export const darkSpeed = (x) => SLIDE.darkSpeed + SLIDE.darkGain * Math.min(1, Math.max(0, x / SLIDE.length));

/* ---------- the freefall: down the well to the bottom of the hat ---------- */

/**
 * Out of Malvado's castle, he tosses you back into the hat and you fall.
 * The well is 20 tiles wide with stone ledges sticking out of its walls
 * and blocks floating in the middle, seeded per run. A shoots cards
 * straight down: they hit what's below and slow your fall, and the
 * cards come back when you land on something.
 */
export const WELL = { cols: 20, rows: 200, gravity: 420, fall: 150, walk: 64, shot: 230, kick: 55, ammo: 6 };

export function makeWell(seed) {
  const rng = makeRng(seed >>> 0);
  const { cols, rows } = WELL;
  const tiles = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => (x < 2 || x >= cols - 2 || y === rows - 1 ? T_WALL : T_AIR)));
  const foes = [], gems = [];
  let side = rng() < 0.5 ? 0 : 1;
  for (let y = 14; y < rows - 10; y += 4 + Math.floor(rng() * 4)) {
    if (rng() < 0.72) {
      // A ledge out of one wall, never more than half way across.
      const len = 3 + Math.floor(rng() * 5);
      for (let k = 0; k < len; k++) tiles[y][side ? cols - 3 - k : 2 + k] = T_WALL;
      if (rng() < 0.4) foes.push({ kind: "bunny", x: ((side ? cols - 2 - len / 2 : 2 + len / 2)) * TILE, y: y * TILE - 3 });
      side = 1 - side;
    } else {
      const w = 2 + Math.floor(rng() * 3), x0 = 5 + Math.floor(rng() * (cols - 10 - w));
      for (let k = 0; k < w; k++) tiles[y][x0 + k] = T_WALL;
    }
    const r = rng();
    const fx = (4 + rng() * (cols - 8)) * TILE, fy = (y - 2) * TILE;
    if (r < 0.3) foes.push({ kind: "spark", x: fx, y: fy });
    else if (r < 0.55) foes.push({ kind: "glove", x: fx, y: fy });
    else if (r < 0.85) gems.push({ x: fx, y: fy });
  }
  return { tiles, foes, gems };
}

/* ---------- the soul ---------- */

/** deep is how many Deep Soul bonuses you have: each makes the soul drain a fifth slower. */
export const drainSoul = (soul, dt, deep = 0) => Math.max(0, soul - SOUL_DRAIN * 0.8 ** deep * dt);
// Kept small on purpose: the soul is a clock, so dawdling costs you.
export const SOUL_GAIN = { sparkle: 3, spirit: 30, boss: 35, block: 1 };
/** How often a beaten enemy drops a sparkle. */
export const SPARKLE_DROP = 0.35;
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
  return Array.isArray(r.beaten) && r.beaten.length === LAYERS.length && Array.isArray(r.cleared) && Array.isArray(r.freed) && Array.isArray(r.fountains);
}

/**
 * Runs saved before the castle had three layers. Slot the castle in: a
 * run already at the bottom counts it as done, one higher up still has it
 * ahead. Anything else comes back as it was.
 */
export function upgradeRun(r) {
  if (!r || r.v !== 2 || !Array.isArray(r.beaten) || r.beaten.length !== LAYERS.length - 1) return r;
  const c = CASTLE_LAYER;
  const shift = (k) => { const [l, room] = String(k).split(":").map(Number); return l >= c ? `${l + 1}:${room}` : k; };
  const past = r.layer >= c;
  return {
    ...r,
    layer: past ? r.layer + 1 : r.layer,
    beaten: [...r.beaten.slice(0, c), past, ...r.beaten.slice(c)],
    cleared: (r.cleared || []).map(shift),
    freed: (r.freed || []).map(shift),
    fountains: (r.fountains || []).map(shift),
  };
}

/** Beat a layer's boss: a heart container, a soul top-up, and the way down. */
export function beatBoss(run) {
  run.beaten[run.layer] = true;
  run.maxHp = Math.min(12, run.maxHp + 2);
  run.hp = run.maxHp;
  run.soul = gainSoul(run.soul, "boss");
  return run.layer === LAYERS.length - 1;
}

/**
 * Beat one of the castle's bosses. Each gives a heart and some soul and
 * marks its room done; only the last one ends the layer.
 */
export function beatRoomBoss(run, roomKey, last) {
  if (!run.cleared.includes(roomKey)) run.cleared.push(roomKey);
  if (last) return beatBoss(run);
  run.maxHp = Math.min(12, run.maxHp + 2);
  run.hp = run.maxHp;
  run.soul = gainSoul(run.soul, "boss");
  return false;
}

/** Take the ladder down to the next layer's start room. */
export function descend(run) {
  run.layer = Math.min(LAYERS.length - 1, run.layer + 1);
  run.room = layoutLayer(run.layer).start;
  return run;
}

/* ---------- small helpers ---------- */

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * Four-way facing from a stick: up, down, left or right, so shots line up
 * easily. Near a diagonal you keep whichever of its two directions you
 * were already facing, so walking diagonally doesn't flip your aim.
 */
export function faceFrom(x, y, prev) {
  const m = Math.hypot(x, y);
  if (m < 0.3) return prev;
  const ax = Math.abs(x), ay = Math.abs(y);
  if (Math.abs(ax - ay) < 0.25 * m) {
    if (prev.x && Math.sign(prev.x) === Math.sign(x)) return prev;
    if (prev.y && Math.sign(prev.y) === Math.sign(y)) return prev;
  }
  return ax >= ay ? { x: Math.sign(x), y: 0 } : { x: 0, y: Math.sign(y) };
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
  const n = 3 + (L.depth ?? layerIx) + Math.floor(rng() * 2);
  return Array.from({ length: n }, () => L.enemies[Math.floor(rng() * L.enemies.length)]);
}
