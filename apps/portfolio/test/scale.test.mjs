/* "1 to 10": the topic builder and the scoring.
 *
 * All of it is string composition and arithmetic, so all of it runs here.
 * The builder's whole job is to read naturally out loud, which is the sort
 * of thing that quietly degrades into "Desserts in in any park" unless
 * something is checking.
 */

import {
  SUBJECTS, PLACES, PARK_IDS,
  placesFor, joinPlaces, topicFor, randomTopic,
  secretNumber, isValidGuess, scoreGuess, verdictFor,
  SCALE_MIN, SCALE_MAX, POINTS,
  PLACE_PARKS, PLACE_NONE,
} from '../../disney-trivia/js/scale.js';

let failures = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};

/* ── the catalogue itself ────────────────────────────────────────────────── */
console.log('\nthe subjects and places');
{
  ok('there are plenty of subjects', SUBJECTS.length >= 25, SUBJECTS.length);
  ok('every subject has a unique id', new Set(SUBJECTS.map((s) => s.id)).size === SUBJECTS.length);
  ok('every subject has a label and a phrase', SUBJECTS.every((s) => s.label && s.phrase));
  ok('every subject says where it applies', SUBJECTS.every((s) => Array.isArray(s.takes) && s.takes.length));
  ok('every subject is grouped', SUBJECTS.every((s) => s.group));
  // Phrases are dropped mid-sentence, so a capital would read wrong unless
  // it is a proper noun.
  ok('phrases are lower case unless proper nouns',
    SUBJECTS.every((s) => s.phrase[0] === s.phrase[0].toLowerCase() || /^(Disney|Pixar|Star|Marvel|World)/.test(s.phrase)),
    SUBJECTS.filter((s) => s.phrase[0] !== s.phrase[0].toLowerCase()).map((s) => s.phrase));
  ok('four parks', PARK_IDS.length === 4, PARK_IDS);
  ok('every place has a unique id', new Set(PLACES.map((p) => p.id)).size === PLACES.length);
}
{
  ok('rides happen in parks', placesFor('ride').join() === PARK_IDS.join(), placesFor('ride'));
  ok('shops happen in more places than parks', placesFor('shop').length > PARK_IDS.length, placesFor('shop'));
  // The builder should not offer nonsense like "Disney films in EPCOT".
  ok('films happen nowhere in particular', placesFor('film').length === 0);
  ok('so do resort hotels', placesFor('hotel').length === 0);
  ok('an unknown subject offers nothing', placesFor('nope').length === 0);
}

/* ── joining place names ─────────────────────────────────────────────────── */
console.log('\nreading a list out loud');
{
  ok('nothing is nothing', joinPlaces([]) === '');
  ok('one is itself', joinPlaces(['EPCOT']) === 'EPCOT');
  ok('two take an or', joinPlaces(['EPCOT', 'Magic Kingdom']) === 'EPCOT or Magic Kingdom');
  ok('three take commas then an or',
    joinPlaces(['a', 'b', 'c']) === 'a, b or c', joinPlaces(['a', 'b', 'c']));
}

/* ── composing a topic ───────────────────────────────────────────────────── */
console.log('\nbuilding the thing you read out');
{
  ok('a subject in one park', topicFor('dessert', ['mk']) === 'Desserts in Magic Kingdom', topicFor('dessert', ['mk']));
  ok('a subject with no park means any park',
    topicFor('coaster', []) === 'Roller coasters in any park', topicFor('coaster', []));
  ok('all four parks reads as any park, not a list of four',
    topicFor('single', PARK_IDS) === 'Single rider lines in any park', topicFor('single', PARK_IDS));
  ok('two parks are listed', topicFor('land', ['mk', 'ep']) === 'Lands in Magic Kingdom or EPCOT', topicFor('land', ['mk', 'ep']));
  ok('queues in one park', topicFor('queue', ['hs']) === 'Queues in Hollywood Studios');

  // "at Disney Springs", not "in Disney Springs".
  ok('Disney Springs takes "at"', topicFor('shop', ['springs']) === 'Shops at Disney Springs', topicFor('shop', ['springs']));
  ok('the resorts take "at"', topicFor('quick', ['resorts']) === 'Quick service food at the resorts', topicFor('quick', ['resorts']));
  ok('a park first keeps "in"', topicFor('quick', ['ep', 'springs']) === 'Quick service food in EPCOT or Disney Springs', topicFor('quick', ['ep', 'springs']));

  // A subject that takes no place must never gain one.
  ok('films take no place at all', topicFor('film', []) === 'Disney films', topicFor('film', []));
  ok('and ignore one if offered', topicFor('film', ['mk']) === 'Disney films', topicFor('film', ['mk']));
  ok('hotels likewise', topicFor('hotel', ['mk', 'springs']) === 'Resort hotels');

  // A place the subject does not accept is dropped rather than printed.
  ok('an impossible place is dropped',
    topicFor('ride', ['springs']) === 'Rides in any park', topicFor('ride', ['springs']));
  ok('and a mix keeps only the sensible ones',
    topicFor('ride', ['mk', 'springs']) === 'Rides in Magic Kingdom', topicFor('ride', ['mk', 'springs']));

  ok('an unknown subject composes nothing', topicFor('nope', ['mk']) === '');
}
{
  // Every subject must produce something readable with no place chosen,
  // because that is the default state of the builder.
  const bad = SUBJECTS.map((s) => [s.id, topicFor(s.id, [])])
    .filter(([, t]) => !t || /\s{2}|\bin in\b|\bat at\b|\bin\s*$|\bat\s*$/.test(t));
  ok('every subject reads cleanly with no place picked', bad.length === 0, bad);

  // And with every place it accepts.
  const bad2 = [];
  for (const s of SUBJECTS) {
    const allowed = placesFor(s.id);
    for (const p of allowed) {
      const t = topicFor(s.id, [p]);
      if (!t || /\s{2}|\bin in\b|\bat at\b/.test(t)) bad2.push([s.id, p, t]);
    }
    if (allowed.length) {
      const t = topicFor(s.id, allowed);
      if (!t || /\s{2}/.test(t)) bad2.push([s.id, 'all', t]);
    }
  }
  ok('and with every place it accepts, singly and all at once', bad2.length === 0, bad2.slice(0, 5));

  ok('every topic starts with a capital',
    SUBJECTS.every((s) => { const t = topicFor(s.id, []); return t[0] === t[0].toUpperCase(); }));
}

/* ── a topic from nowhere ────────────────────────────────────────────────── */
console.log('\nthe shuffle button');
{
  // Deterministic sweep: every random draw must be a usable topic.
  const seen = new Set();
  let broken = null;
  for (let i = 0; i < 400; i++) {
    const t = randomTopic();
    if (!t || /\s{2}|\bin in\b|\bat at\b|undefined/.test(t)) { broken = t; break; }
    seen.add(t);
  }
  ok('400 random topics are all well formed', broken === null, broken);
  ok('and there is real variety in them', seen.size > 40, seen.size);

  // Pinned randomness, so the branches are exercised rather than hoped for.
  const always = (v) => () => v;
  ok('the lowest draw is a real topic', randomTopic(always(0)).length > 3, randomTopic(always(0)));
  ok('the highest draw is a real topic', randomTopic(always(0.999)).length > 3, randomTopic(always(0.999)));
}

/* ── the number ──────────────────────────────────────────────────────────── */
console.log('\nthe secret number');
{
  const draws = Array.from({ length: 2000 }, () => secretNumber());
  ok('never below the floor', Math.min(...draws) === SCALE_MIN, Math.min(...draws));
  ok('never above the ceiling', Math.max(...draws) === SCALE_MAX, Math.max(...draws));
  ok('every number on the scale comes up', new Set(draws).size === SCALE_MAX - SCALE_MIN + 1);
  ok('always a whole number', draws.every(Number.isInteger));
  // The ends must be as likely as the middle; a naive round() halves them.
  const counts = {};
  draws.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  const lo = counts[SCALE_MIN], mid = counts[5];
  ok('the ends are not half as likely as the middle', lo > mid * 0.7, { lo, mid });
}
{
  ok('1 is a valid guess', isValidGuess(1));
  ok('10 is a valid guess', isValidGuess(10));
  ok('0 is not', !isValidGuess(0));
  ok('11 is not', !isValidGuess(11));
  ok('7.5 is not', !isValidGuess(7.5));
  ok('nothing is not', !isValidGuess(null) && !isValidGuess(undefined) && !isValidGuess(NaN));
  ok('a string is not', !isValidGuess('7'));
}

/* ── scoring ─────────────────────────────────────────────────────────────── */
console.log('\nscoring a guess');
{
  ok('dead on', scoreGuess(7, 7) === POINTS.exact);
  ok('one under', scoreGuess(6, 7) === POINTS.within1);
  ok('one over', scoreGuess(8, 7) === POINTS.within1);
  ok('two out', scoreGuess(5, 7) === POINTS.within2);
  ok('three out is nothing', scoreGuess(4, 7) === 0);
  ok('the far end is nothing', scoreGuess(1, 10) === 0);
  ok('scoring is symmetric', scoreGuess(6, 7) === scoreGuess(8, 7));
  ok('nonsense scores zero rather than throwing', scoreGuess(null, 7) === 0 && scoreGuess(7, 99) === 0);
  // The game as actually played: guessed 7, it was 8.
  ok('the real round scores as one out', scoreGuess(7, 8) === POINTS.within1);
}
{
  ok('spot on says so', /spot on/i.test(verdictFor(7, 7)));
  ok('one out is still praised', /close enough/i.test(verdictFor(7, 8)));
  ok('far off says so', /nowhere/i.test(verdictFor(1, 10)));
  ok('nonsense says nothing', verdictFor(null, 7) === '');
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
