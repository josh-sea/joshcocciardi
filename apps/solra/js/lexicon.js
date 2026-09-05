/* Solra v0.1 — the language itself.
 *
 * Everything downstream (synthesis, decoding, drills, the dictionary) reads
 * from this file. Addresses are never written by hand: a word is defined by
 * its CLASS/FAMILY/MEMBER position in the tables below and the CHECK slot is
 * computed, so the parity property in §2 of the spec cannot drift out of sync
 * with the data.
 */

export const SYLLABLES = ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'vu'];

export const FREQ = [440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66];

export const NOTE_NAMES = ['A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6'];

/* One pentatonic step, approximated as three semitones (spec §8.1). */
export const REGISTER_STEP = Math.pow(2, 3 / 12);

export const CLASSES = [
  { id: 0, name: 'CORE',   gloss: 'polarity, social, discourse' },
  { id: 1, name: 'BEING',  gloss: 'persons and animates' },
  { id: 2, name: 'THING',  gloss: 'objects, substances, places' },
  { id: 3, name: 'ACT',    gloss: 'verbs' },
  { id: 4, name: 'STATE',  gloss: 'qualities and conditions' },
  { id: 5, name: 'AMOUNT', gloss: 'digits, quantity, degree' },
  { id: 6, name: 'INDEX',  gloss: 'time, deixis, relation' },
  { id: 7, name: 'META',   gloss: 'protocol and escapes' },
];

/* Members are listed in slot-3 order. Position is the address. */
const TABLES = [
  ['CORE', [
    ['Polarity',    ['YES', 'NO', 'MAYBE', 'UNKNOWN', 'TRUE', 'FALSE', 'SAME', 'OTHER']],
    ['Social',      ['HELLO', 'GOODBYE', 'THANK', 'SORRY', 'PLEASE', 'OK', 'NAME', 'FRIEND']],
    ['Discourse',   ['AND', 'OR', 'NOT', 'IF', 'BECAUSE', 'BUT', 'ASK', 'STRESS']],
  ]],
  ['BEING', [
    ['Persons',     ['I', 'YOU', 'WE', 'THEY', 'SOMEONE', 'NOBODY', 'HUMAN', 'DROID']],
    ['Animates',    ['DOG', 'CAT', 'BIRD', 'CHILD', 'GROUP', 'ANIMAL', 'PLANT', 'SELF']],
  ]],
  ['THING', [
    ['Physical',    ['THING', 'WATER', 'FOOD', 'AIR', 'GROUND', 'LIGHT', 'SOUND', 'POWER']],
    ['Made',        ['MACHINE', 'CAMERA', 'TOOL', 'DOOR', 'PATH', 'HOME', 'VEHICLE', 'BOX']],
    ['Places',      ['PLACE', 'ROOM', 'ROAD', 'SKY', 'TREE', 'WALL', 'EDGE', 'WORLD']],
  ]],
  ['ACT', [
    ['Motion',      ['GO', 'STOP', 'COME', 'FOLLOW', 'TURN', 'JUMP', 'FALL', 'WAIT']],
    ['Mind',        ['SEE', 'HEAR', 'KNOW', 'WANT', 'THINK', 'FIND', 'FORGET', 'LEARN']],
    ['Interaction', ['GIVE', 'TAKE', 'MAKE', 'BREAK', 'OPEN', 'CLOSE', 'HELP', 'TELL']],
    ['Process',     ['START', 'END', 'CHANGE', 'REPEAT', 'CHARGE', 'RECORD', 'SEND', 'WORK']],
  ]],
  ['STATE', [
    ['Valuation',   ['GOOD', 'BAD', 'SAFE', 'DANGER', 'READY', 'BROKEN', 'EASY', 'HARD']],
    ['Qualities',   ['BIG', 'SMALL', 'HOT', 'COLD', 'WET', 'DRY', 'FAST', 'SLOW']],
    ['Condition',   ['NEW', 'OLD', 'FULL', 'EMPTY', 'LOUD', 'QUIET', 'BRIGHT', 'DARK']],
    ['Feeling',     ['HAPPY', 'SAD', 'AFRAID', 'ANGRY', 'TIRED', 'CURIOUS', 'CALM', 'AMAZED']],
  ]],
  ['AMOUNT', [
    ['Digits',      ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN']],
    ['Quantity',    ['ALL', 'MANY', 'SOME', 'FEW', 'NONE', 'MORE', 'LESS', 'ENOUGH']],
    ['Degree',      ['VERY', 'SLIGHT', 'ALMOST', 'EXACT', 'ABOUT', 'MAX', 'MIN', 'HALF']],
  ]],
  ['INDEX', [
    ['Time',        ['NOW', 'BEFORE', 'AFTER', 'SOON', 'LONG', 'BRIEF', 'DAY', 'NIGHT']],
    ['Deixis',      ['THIS', 'THAT', 'HERE', 'THERE', 'LEFT', 'RIGHT', 'FRONT', 'BACK']],
    ['Relation',    ['TO', 'FROM', 'WITH', 'IN', 'OUT', 'UNDER', 'NEAR', 'AMONG']],
  ]],
  ['META', [
    ['Protocol',    ['ACK', 'NACK', 'AGAIN', 'STANDBY', 'ERROR', 'VERSION', 'ID', 'OVER']],
    ['Escape',      ['NUM', 'TEXT', 'RAW', 'MODE', 'LINK', 'SYNC', 'TEST', 'NULL']],
  ]],
];

/* English hints, used by the dictionary and by sentence drills. Keeping them
 * out of TABLES keeps the address tables readable. */
const HINTS = {
  STRESS: 'emphasis marker', SELF: 'oneself, reflexive', GROUP: 'a crowd, a set of beings',
  EDGE: 'boundary, border, brink', PATH: 'a way through', BRIEF: 'a short while',
  LONG: 'a long while', SLIGHT: 'a little, barely', EXACT: 'precisely',
  ABOUT: 'roughly, approximately', MAX: 'the most', MIN: 'the least',
  AMONG: 'in the middle of', STANDBY: 'hold, wait for me', ACK: 'received, understood',
  NACK: 'not received', AGAIN: 'say again', OVER: 'my turn is done',
  NUM: 'numbers follow, base 8', TEXT: 'spelled text follows', RAW: 'raw payload follows',
  MODE: 'switch mode', LINK: 'establish a link', SYNC: 'synchronise', TEST: 'test pattern',
  NULL: 'nothing, placeholder', ID: 'identifier', VERSION: 'spec version',
  CHARGE: 'take on power', RECORD: 'capture to memory', WORK: 'operate, labour',
  AMAZED: 'astonished', CURIOUS: 'wanting to know', READY: 'prepared',
  BROKEN: 'not working', OTHER: 'different one', SAME: 'identical',
};

function checkSlot(cls, fam, mem) {
  return (8 - ((cls + fam + mem) % 8)) % 8;
}

function build() {
  const words = [];
  const families = [];
  TABLES.forEach((entry, cls) => {
    const [className, fams] = entry;
    fams.forEach((f, fam) => {
      const [famName, members] = f;
      const famWords = [];
      members.forEach((gloss, mem) => {
        const slots = [cls, fam, mem, checkSlot(cls, fam, mem)];
        const word = {
          gloss,
          cls, fam, mem,
          className,
          familyName: famName,
          slots,
          address: slots.join(''),
          roman: slots.map((s) => SYLLABLES[s]).join('-'),
          hint: HINTS[gloss] || '',
        };
        words.push(word);
        famWords.push(word);
      });
      families.push({ cls, fam, className, name: famName, key: `${cls}.${fam}`, words: famWords });
    });
  });
  return { words, families };
}

const built = build();

export const WORDS = built.words;
export const FAMILIES = built.families;

export const BY_GLOSS = new Map(WORDS.map((w) => [w.gloss, w]));
export const BY_ADDRESS = new Map(WORDS.map((w) => [w.address, w]));

export function wordAt(cls, fam, mem) {
  return BY_ADDRESS.get(`${cls}${fam}${mem}${checkSlot(cls, fam, mem)}`) || null;
}

/* Slot parity, spec §2. A single wrong slot always lands outside the code. */
export function isValidWord(slots) {
  if (!slots || slots.length !== 4) return false;
  if (slots.some((s) => !Number.isInteger(s) || s < 0 || s > 7)) return false;
  return slots[3] === checkSlot(slots[0], slots[1], slots[2]);
}

export function romanize(slots) {
  return slots.map((s) => SYLLABLES[s]).join('-');
}

export function parseRoman(text) {
  const parts = String(text).trim().toLowerCase().split(/[-\s]+/);
  if (parts.length !== 4) return null;
  const slots = parts.map((p) => SYLLABLES.indexOf(p));
  if (slots.some((s) => s < 0)) return null;
  return slots;
}

export const CHECK = checkSlot;

/* Prosody, spec §3. Fully enumerated so the validator can reject anything else. */
export const REGISTERS = [
  { value: 1,  mark: '^', name: 'Bright',  meaning: 'affirmative, positive, good news' },
  { value: 0,  mark: '',  name: 'Neutral', meaning: 'neutral, factual' },
  { value: -1, mark: '_', name: 'Low',     meaning: 'negative, bad news, refusal' },
];

export const URGENCIES = [
  { value: 0, mark: '',   name: 'U0 routine',  slotMs: 80, gapMs: 20, wordGapMs: 120, meaning: 'routine' },
  { value: 1, mark: '!',  name: 'U1 elevated', slotMs: 60, gapMs: 10, wordGapMs: 60,  meaning: 'elevated, get moving' },
  { value: 2, mark: '!!', name: 'U2 alarm',    slotMs: 45, gapMs: 0,  wordGapMs: 0,   meaning: 'alarm, act now' },
];

export const CODAS = [
  { value: 'rise',  mark: '?', name: 'Rise',  meaning: 'question' },
  { value: 'fall',  mark: '.', name: 'Fall',  meaning: 'statement, assertion' },
  { value: 'level', mark: ',', name: 'Level', meaning: 'continuing, more to come' },
  { value: 'trill', mark: '~', name: 'Trill', meaning: 'uncertainty, hedge, guess' },
];

export const URGENCY_BY_VALUE = new Map(URGENCIES.map((u) => [u.value, u]));
export const CODA_BY_VALUE = new Map(CODAS.map((c) => [c.value, c]));
export const CODA_BY_MARK = new Map(CODAS.map((c) => [c.mark, c]));

/* Families whose members behave specially in the syntax checker. */
export const RELATION_WORDS = new Set(FAMILIES.find((f) => f.key === '6.2').words.map((w) => w.gloss));
export const DIGIT_WORDS = FAMILIES.find((f) => f.key === '5.0').words.map((w) => w.gloss);
