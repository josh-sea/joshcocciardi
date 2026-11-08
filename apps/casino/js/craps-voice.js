/* What the stickman calls and what the rail shouts. Pure.
 *
 * Craps has a language of its own and half the fun is hearing it. Every
 * roll gets a dealer call ("Eighter from Decatur, the point is eight!"),
 * and the crowd chimes in: cheers for naturals and points, groans at a
 * seven-out, side bets of encouragement while the point is on. Lines are
 * picked with the table's own random, so every phone at a table with
 * friends hears the same thing.
 *
 * Each call says what the slang means right after it, so it teaches too.
 */

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

/* The names for each total, with the hard-way names where they differ. */
export const SLANG = {
  2: ['Aces', 'Snake eyes', 'Eyeballs'],
  3: ['Ace-deuce', 'Three craps, ace-deuce'],
  4: ['Little Joe', 'Four, easy four'],
  5: ['Fever five', 'Five, no field five'],
  6: ['Jimmie Hicks', 'Six, easy six', 'Sixie from Dixie'],
  7: ['Seven', 'Big red'],
  8: ['Eighter from Decatur', 'Easy eight'],
  9: ['Nina', 'Center field nine', 'Nine, Nina from Pasadena'],
  10: ['Big Ben', 'Ten, easy ten'],
  11: ['Yo-leven', 'Yo'],
  12: ['Boxcars', 'Midnight', 'Twelve, craps'],
};
export const HARD_SLANG = { 4: 'Hard four, Little Joe from Kokomo', 6: 'Hard six', 8: 'Hard eight, a square pair', 10: 'Hard ten, puppy paws' };

export const CROWD = ['Big Al', 'Doris', 'Vinnie', 'Tammy', 'The Professor', 'Uncle Sal', 'Gina', 'Rocco'];

const CHEERS = ['YO!', 'Let\'s gooo!', 'Pay me!', 'Shooter\'s hot!', 'Winner winner!', 'That\'s what I\'m talking about!', 'Again, again!', 'Ka-ching!'];
const POINT_HYPE = ['Come on, {p}!', 'Bring it home, shooter!', 'No sevens, no sevens…', 'Hit that {p}!', 'Same number, baby!', '{p}, {p}, {p}!'];
const GROANS = ['Noooo!', 'Ugh, big red.', 'There goes the rent.', 'Seven out, my favourite.', 'Every time!', 'Who said seven?!'];
const DONT_NOTES = ['(quietly) …thank you.', 'Don\'t side says thanks.'];
const CRAPS_GROAN = ['Craps!', 'Oof.', 'Shake it off, shooter.'];

export function dealerCall({ total, hard, before, after, event }, r = Math.random) {
  const slang = hard && HARD_SLANG[total] ? HARD_SLANG[total] : pick(SLANG[total], r);
  if (!before) {
    if (event === 'natural') return total === 7 ? `${pick(['Seven', 'Big red'], r)}! Winner on the pass line, pay the line, take the don'ts.` : `${slang}! Winner, pay the line.`;
    if (event === 'craps') return total === 12 ? `${slang}! Craps, line away. Twelve is a push on the don't.` : `${slang}! Craps, line away, pay the don'ts.`;
    return `${slang}, the point is ${after}. Mark it! Odds are working.`;
  }
  if (event === 'hit') return `${slang}! Winner, the point is made. Pay the line, coming out!`;
  if (event === 'sevenout') return 'Seven out, line away! Pay the don\'ts, last come gets paid. New shooter.';
  if (total === 11) return 'Yo-leven! Pays the field and the yo. Point is still ' + before + '.';
  if (total === 2 || total === 3 || total === 12) return `${slang}! Field pays${total === 12 || total === 2 ? ' extra' : ''}. Point is still ${before}.`;
  return `${slang}${hard && HARD_SLANG[total] ? '!' : ''}. ${pick(['Mark it', 'No action on the line', 'Still working on ' + before, 'Same shooter'], r)}.`;
}

/* Up to two shouts from the rail for a roll. `mood` picks the crowd sound. */
export function crowd({ total, before, event, streak = 0 }, r = Math.random, names = CROWD) {
  const who = () => pick(names, r);
  const out = [];
  let mood = null;
  if (event === 'natural') { mood = 'cheer'; out.push({ who: who(), text: pick(CHEERS, r) }); }
  else if (event === 'hit') {
    mood = 'cheer';
    out.push({ who: who(), text: pick(CHEERS, r) });
    if (streak >= 2) out.push({ who: who(), text: `That's ${streak} points! Nobody leave!` });
    else if (r() < 0.5) out.push({ who: who(), text: pick(CHEERS, r) });
  } else if (event === 'sevenout') {
    mood = 'groan';
    out.push({ who: who(), text: pick(GROANS, r) });
    if (r() < 0.35) out.push({ who: who(), text: pick(DONT_NOTES, r) });
  } else if (event === 'craps') { mood = 'groan'; out.push({ who: who(), text: pick(CRAPS_GROAN, r) }); }
  else if (event === 'point') { if (r() < 0.6) out.push({ who: who(), text: pick(POINT_HYPE, r).replace(/\{p\}/g, String(total)) }); }
  else if (before && r() < 0.35) {
    out.push({ who: who(), text: total === 11 ? 'Yo! Should\'ve been on it.' : pick(POINT_HYPE, r).replace(/\{p\}/g, String(before)) });
  }
  return { lines: out, mood };
}

/* What the stickman says before the dice go: called when the table is
 * waiting on the shooter.
 */
export function beforeRoll({ point, newShooter, shooterName }, r = Math.random) {
  if (newShooter) return `New shooter${shooterName ? `: ${shooterName}` : ''}! Coming out, get your line bets down.`;
  if (!point) return pick(['Coming out! Bets on the pass line.', 'Coming out, coming out! Pass line, don\'t pass.', 'New come-out roll. Get your line bets down.'], r);
  return pick([`Point is ${point}. Odds behind the line, folks.`, `${point} is the point. Come bets, place bets, all working.`, `Shooter's looking for a ${point}.`], r);
}

/* A wisecrack for a bet nobody should love. */
export function onBet(key, r = Math.random) {
  if (key === 'seven') return pick(['Any seven! The stickman thanks you.', 'Big red in the middle. Bold.'], r);
  if (key === 'yo') return 'Yo bet! Fifteen to one if it comes.';
  if (/^hard/.test(key)) return pick([`${key.replace('hard', 'Hard ')}, the hard way!`, 'Hardway bet, nice and square.'], r);
  if (key === 'aces' || key === 'twelve') return 'Thirty to one! Long shot.';
  if (/Odds$|^comeOdds|^dcOdds/.test(key)) return pick(['Odds! Best bet in the house.', 'Taking the odds. Smart money.'], r);
  return null;
}
