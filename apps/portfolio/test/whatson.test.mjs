/* What else is happening at a given hour.
 *
 * The chart says what a ride usually does; this says why it might. The
 * claims are specific enough to be wrong, so they are pinned: a parade at
 * two, a party that shuts the gates at six, an Early Entry that explains
 * the morning.
 */

import {
  kindOf, MOVES_CROWDS, dayShape, duringTicketed, parkNote, showsAt, whatsOn,
  PARTY_RUN_UP_MIN,
} from '../../disney-trivia/js/whatson.js';

let failures = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};
const T = (h, m = 0) => `2026-10-29T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`;
const ms = (h, m = 0) => new Date(T(h, m)).getTime();
const DATE = '2026-10-29';

/* ── naming things ───────────────────────────────────────────────────────── */
console.log('\nwhat kind of thing it is');
{
  // Real names from the feed.
  ok('a parade', kindOf('Disney Festival of Fantasy Parade') === 'parade');
  ok('a cavalcade is a parade', kindOf('Disney Adventure Friends Cavalcade') === 'parade');
  ok('fireworks', kindOf("Disney's Not-So-Spooky Spectacular") === 'fireworks');
  ok('a meet', kindOf('Meet Ariel at Her Grotto') === 'meet');
  ok('another meet', kindOf('Meet Mickey at Town Square Theater') === 'meet');
  ok('atmosphere music', kindOf('The Dapper Dans') === 'music');
  ok('and a pianist', kindOf("Casey's Corner Pianist") === 'music');
  ok('anything else is a show', kindOf('Mickey’s Magical Friendship Faire') === 'show');
  ok('nothing is still a show', kindOf(null) === 'show');

  /* Order matters: a Halloween parade is a parade first. Matched the other
   * way round, "Boo-To-You Halloween Parade" would be filed as a show. */
  ok('a party parade is still a parade', kindOf('Mickey’s Boo-To-You Halloween Parade at Mickey’s Not-So-Scary') === 'parade');

  ok('only parades and fireworks move crowds',
    MOVES_CROWDS.has('parade') && MOVES_CROWDS.has('fireworks')
      && !MOVES_CROWDS.has('show') && !MOVES_CROWDS.has('meet') && !MOVES_CROWDS.has('music'));
}

/* ── the park's day ──────────────────────────────────────────────────────── */
console.log('\nreading the park’s own day');

// A real party day: early entry, open 9 to 6, ticketed event 7pm to midnight.
const partyDay = [
  { date: DATE, type: 'TICKETED_EVENT', description: 'Early Entry', openingTime: T(8, 30), closingTime: T(9) },
  { date: DATE, type: 'OPERATING', openingTime: T(9), closingTime: T(18) },
  { date: DATE, type: 'TICKETED_EVENT', description: 'Special Ticketed Event', openingTime: T(19), closingTime: T(23, 59) },
  { date: '2026-10-30', type: 'OPERATING', openingTime: T(9), closingTime: T(22) },
];
const normalDay = [
  { date: DATE, type: 'TICKETED_EVENT', description: 'Early Entry', openingTime: T(8, 30), closingTime: T(9) },
  { date: DATE, type: 'OPERATING', openingTime: T(9), closingTime: T(22) },
];
{
  const s = dayShape(partyDay, DATE);
  ok('opening time', s.open === ms(9));
  ok('closing time', s.close === ms(18));
  ok('early entry', s.earlyOpen === ms(8, 30));
  ok('the ticketed event is picked up', s.ticketed.length === 1 && s.ticketed[0].start === ms(19));
  ok('early entry is not counted as a party', s.ticketed.every((t) => t.name !== 'Early Entry'));
  ok('another day is not mixed in', dayShape(partyDay, '2026-10-30').close === ms(22));
  ok('an unknown date is empty', dayShape(partyDay, '2020-01-01').open === null);
  ok('no schedule does not throw', dayShape(null, DATE).open === null);
}
{
  const s = dayShape(partyDay, DATE);
  ok('eight at night is inside the party', duringTicketed(ms(20), s) !== null);
  ok('two in the afternoon is not', duringTicketed(ms(14), s) === null);
  ok('and nor is half six, between the two', duringTicketed(ms(18, 30), s) === null);
}

console.log('\nwhat the park is doing at a given hour');
{
  const s = dayShape(partyDay, DATE);
  ok('before opening says so', parkNote(ms(7), s).tone === 'shut');
  ok('early entry is called out', parkNote(ms(8, 40), s).tone === 'early');
  ok('and explains who it is for', /resort guests/i.test(parkNote(ms(8, 40), s).says));
  ok('mid-morning has nothing to say', parkNote(ms(11), s) === null);

  /* The one that actually explains a strange afternoon: a park shutting at
   * six to day guests has everybody on the headliners from four. */
  const rush = parkNote(ms(16, 30), s);
  ok('the run-up to an early close is flagged', rush && rush.tone === 'rush', rush);
  ok('and says why', /ticketed party/i.test(rush.says), rush.says);
  ok('the run-up window is where it says', PARTY_RUN_UP_MIN === 120);
  ok('three hours out is too early to flag', parkNote(ms(14, 30), s) === null);

  ok('during the party it says day tickets are no good',
    /day tickets are not valid/i.test(parkNote(ms(20), s).says));
  ok('and after it, closed', parkNote(ms(18, 30), s).tone === 'shut');
}
{
  // On an ordinary day the same hours say much less.
  const s = dayShape(normalDay, DATE);
  ok('a normal afternoon is unremarkable', parkNote(ms(16, 30), s) === null);
  ok('but the last hour is still the last hour', parkNote(ms(21, 30), s).tone === 'rush');
  ok('and it does not blame a party', !/party/i.test(parkNote(ms(21, 30), s).says));
  ok('no shape, no note', parkNote(ms(12), null) === null);
}

/* ── what is on ──────────────────────────────────────────────────────────── */
console.log('\nwhat is on in an hour');

const shows = [
  { id: 'fof',   name: 'Disney Festival of Fantasy Parade', showtimes: [{ startTime: T(14), endTime: T(14, 20) }] },
  { id: 'cav',   name: 'Disney Adventure Friends Cavalcade', showtimes: [{ startTime: T(11, 5), endTime: T(11, 15) }] },
  { id: 'fw',    name: "Disney's Not-So-Spooky Spectacular", showtimes: [{ startTime: T(22), endTime: T(22, 15) }] },
  { id: 'faire', name: 'Mickey’s Magical Friendship Faire', showtimes: [{ startTime: T(14, 55), endTime: T(15, 15) }] },
  { id: 'dans',  name: 'The Dapper Dans', showtimes: [{ startTime: T(14, 10), endTime: T(14, 30) }] },
  { id: 'ariel', name: 'Meet Ariel at Her Grotto', showtimes: [{ startTime: T(9, 30), endTime: T(17, 30) }] },
];
{
  const at2 = showsAt(shows, ms(14), ms(15));
  ok('the parade is found', at2.some((e) => e.id === 'fof'));
  ok('and it is first, because it moves people', at2[0].id === 'fof', at2.map((e) => e.id));
  ok('the barbershop quartet is found too', at2.some((e) => e.id === 'dans'));
  /* A meet that runs 9:30 to 17:30 is a location, not an event. Including it
   * at two o'clock would be noise in every single hour of the day. */
  ok('an all-day meet is not an event at two o’clock', !at2.some((e) => e.id === 'ariel'), at2.map((e) => e.id));
  ok('and nothing from another hour', !at2.some((e) => e.id === 'cav' || e.id === 'fw'));
}
{
  const at11 = showsAt(shows, ms(11), ms(12));
  ok('the cavalcade is found at eleven', at11.length === 1 && at11[0].id === 'cav');
  ok('and is marked as moving crowds', at11[0].moves === true);
  ok('a quiet hour is empty', showsAt(shows, ms(16), ms(17)).length === 0);
  ok('no shows does not throw', showsAt(null, ms(14), ms(15)).length === 0);
  ok('a show with no times is skipped', showsAt([{ name: 'x' }], ms(14), ms(15)).length === 0);
  ok('a junk time is skipped', showsAt([{ name: 'x', showtimes: [{ startTime: 'nope' }] }], ms(14), ms(15)).length === 0);
}
{
  // Something that starts before the hour and runs into it still counts.
  const long = [{ id: 'l', name: 'Long show', showtimes: [{ startTime: T(13, 50), endTime: T(14, 30) }] }];
  const found = showsAt(long, ms(14), ms(15));
  ok('a show running into the hour counts', found.length === 1);
  ok('but is marked as not starting here', found[0].startsHere === false);
}

/* ── the whole answer for one bar ────────────────────────────────────────── */
console.log('\neverything about one hour');
{
  const two = whatsOn(ms(14), { shows, schedule: partyDay, dateStr: DATE });
  ok('the parade is headlined', two.big.length === 1 && two.big[0].id === 'fof');
  ok('the quartet is kept out of the way', two.quiet.some((e) => e.id === 'dans'));
  ok('and is not in the headline', !two.big.some((e) => e.id === 'dans'));
  ok('nothing to say about the park at two', two.note === null);

  const five = whatsOn(ms(17), { shows, schedule: partyDay, dateStr: DATE });
  ok('five o’clock on a party day explains itself', five.note && five.note.tone === 'rush', five.note);
  ok('with nothing on', five.big.length === 0);

  const ten = whatsOn(ms(22), { shows, schedule: partyDay, dateStr: DATE });
  ok('the fireworks are headlined at ten', ten.big.length === 1 && ten.big[0].id === 'fw');
  ok('and the party is explained', ten.note && ten.note.tone === 'party');

  ok('the shape comes back for the caller', two.shape.close === ms(18));
  ok('an empty everything does not throw', whatsOn(ms(12), {}).big.length === 0);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
