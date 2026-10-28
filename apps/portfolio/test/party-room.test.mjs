/* Party Room: the four games, played through in node.
 *
 * The host's phone runs every game, and the other phones only ever say
 * what they did, so each game is a pure state machine that can be played
 * start to finish here: deal, answer, guess, judge, time out, leave
 * halfway, and come back. The point is the things players would notice:
 * a secret that leaks into the room, a score that counts twice, a turn
 * that never ends because somebody's phone died.
 *
 * Run: node apps/portfolio/test/party-room.test.mjs
 */
import {
  makeCode, codeProblem, normaliseCode, CODE_ALPHABET, cleanName, pickHost, byJoin,
  displayNames, standings, shuffle, seeded, GAMES,
} from '../../party-room/js/room.js';
import { FOREHEAD_DECKS, TRIVIA, TRIVIA_CATEGORIES, SKETCH_WORDS, CHIPS, DIPS } from '../../party-room/js/decks.js';
import * as trivia from '../../party-room/js/trivia.js';
import * as sketch from '../../party-room/js/sketch.js';
import * as chips from '../../party-room/js/chips.js';
import * as forehead from '../../party-room/js/forehead.js';
import * as race from '../../party-room/js/race.js';
import { PUZZLES } from '../../party-room/js/race-puzzles.js';
import { onCall, isFull, offers, plan, forMe, newSid, CAP } from '../../party-room/js/callplan.js';
import { startWorld, actWorld, tickWorld, Host, ENGINES } from '../../party-room/js/engine.js';

let failures = 0, passes = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

// What a write to the database and back does to a value: undefined keys
// vanish, and so do empty objects and arrays.
const viaDb = (x) => JSON.parse(JSON.stringify(x, (k, v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return undefined;
  if (Array.isArray(v) && !v.length) return undefined;
  return v;
}));

const P = (uid, name, joined) => ({ uid, name, joined, online: true });
const CAM = P('cam', 'Cam', 1), BO = P('bo', 'Bo', 2), ASH = P('ash', 'Ash', 3), JOSH = P('josh', 'Josh', 4);

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, add: (ms) => { t += ms; } };
}
const ctxOf = (c, players, seed = 7) => ({ now: c.now(), rand: seeded(seed), players });

/* ── rooms ───────────────────────────────────────────────────────────────── */
console.log('\nrooms');
{
  const rand = seeded(1);
  const codes = Array.from({ length: 500 }, () => makeCode(rand));
  ok('codes are five characters from the alphabet', codes.every((c) => c.length === 5 && [...c].every((ch) => CODE_ALPHABET.includes(ch))));
  ok('codes never contain lookalikes', !codes.some((c) => /[O0I1L]/.test(c)));
  ok('typed codes are tidied', normaliseCode(' ab-cd e ') === 'ABCDE');
  ok('a code with a zero says why', /never have 0/.test(codeProblem('ABCD0')));
  ok('a short code says how long', /5 characters/.test(codeProblem('ABC')));
  ok('a good code has no problem', codeProblem('abcde') === null);
  ok('names lose angle brackets and runs of spaces', cleanName('  <b>Cam</b>   Bo ') === 'bCam/b Bo');
  ok('names are capped at 16', cleanName('x'.repeat(40)).length === 16);

  const players = { cam: CAM, bo: BO, ash: { ...ASH, online: false } };
  ok('the host keeps the room while online', pickHost(players, 'bo') === 'bo');
  ok('an offline host hands over to the longest-standing player',
    pickHost({ ...players, cam: { ...CAM, online: false } }, 'cam') === 'bo');
  ok('turn order is join order', byJoin({ bo: BO, cam: CAM }).map((p) => p.uid).join() === 'cam,bo');
  const names = displayNames({ a: P('a', 'Josh', 1), b: P('b', 'Josh', 2) });
  ok('two people with the same name are told apart', names.a === 'Josh' && names.b === 'Josh 2');
  const rows = standings({ a: 5, b: 9, c: 5 }, { a: 'A', b: 'B', c: 'C' });
  ok('standings go highest first and share tied places', rows.map((r) => `${r.name}${r.place}`).join() === 'B1,A2,C2');
  const s = shuffle([1, 2, 3, 4, 5], seeded(3));
  ok('shuffle keeps every item', s.slice().sort().join() === '1,2,3,4,5');
  ok('every game on the menu has an engine', Object.keys(GAMES).every((id) => ENGINES[id]));
}

/* ── the decks ───────────────────────────────────────────────────────────── */
console.log('\ndecks');
{
  const dupes = (a) => a.filter((x, i) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) !== i);
  for (const [id, d] of Object.entries(FOREHEAD_DECKS)) {
    ok(`Forehead "${d.name}" has 40+ cards and no repeats`, d.cards.length >= 40 && !dupes(d.cards).length, dupes(d.cards).join());
  }
  ok('every trivia question names a real category', TRIVIA.every((q) => TRIVIA_CATEGORIES[q[0]]));
  ok('every trivia question has four different options',
    TRIVIA.every((q) => q.length === 6 && new Set(q.slice(2).map((x) => x.toLowerCase())).size === 4));
  ok('no trivia question is asked twice', !dupes(TRIVIA.map((q) => q[1])).length);
  for (const cat of Object.keys(TRIVIA_CATEGORIES)) {
    ok(`trivia "${cat}" has enough for a 10-question game`, trivia.questionPool(cat).length >= 10);
  }
  const allWords = Object.values(SKETCH_WORDS).flat();
  ok('sketch words are lower case', allWords.every((w) => w === w.toLowerCase()));
  ok('no sketch word appears twice', !dupes(allWords).length, dupes(allWords).join());
  ok('chips and dips have no repeats', !dupes(CHIPS).length && !dupes(DIPS).length, dupes(DIPS).join());
  ok('there are enough dips for eight hands and then some', DIPS.length >= 8 * chips.HAND * 3);
}

/* ── Forehead: the tilt ──────────────────────────────────────────────────── */
console.log('\nforehead tilt');
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok('face up reads 1', near(forehead.screenUp(0, 0), 1));
  ok('face down reads -1', near(forehead.screenUp(180, 0), -1));
  ok('upright in portrait reads 0', near(forehead.screenUp(90, 0), 0));
  ok('upright in landscape reads 0, whatever beta is', near(forehead.screenUp(37, 90), 0) && near(forehead.screenUp(-160, -90), 0));

  const latch = forehead.tiltLatch();
  ok('nothing fires before the phone has been upright', latch(-0.9) === null);
  ok('upright arms it', latch(0.1) === null);
  ok('nodding down is "got it"', latch(-0.8) === 'got');
  ok('staying down does not fire again', latch(-0.95) === null && latch(-0.7) === null);
  latch(0);
  ok('tipping up is "pass"', latch(0.75) === 'pass');
  ok('halfway is nothing', (latch(0.2), latch(0.5)) === null);
  ok('garbage from the sensor is ignored', latch(NaN) === null);
}

/* ── Forehead in a room ─────────────────────────────────────────────────── */
console.log('\nforehead in a room');
{
  const c = clock(), players = [CAM, BO, ASH];
  let w = startWorld('forehead', players, { deck: 'disney' }, ctxOf(c, players));
  ok('starts with the first player ready', w.pub.phase === 'ready' && w.pub.guesser === 'cam' && w.pub.deck === 'disney');
  w = actWorld(w, 'bo', { t: 'go' }, ctxOf(c, players));
  ok('only the guesser can start their turn', w.pub.phase === 'ready');
  w = actWorld(w, 'cam', { t: 'go' }, ctxOf(c, players));
  ok('go deals the deck and starts a countdown', w.pub.phase === 'playing' && w.pub.cards.length === FOREHEAD_DECKS.disney.cards.length && w.pub.startsAt === c.now() + forehead.COUNTDOWN_MS);
  c.add(forehead.COUNTDOWN_MS + 1000);
  w = actWorld(w, 'cam', { t: 'mark', i: 0, ok: true }, ctxOf(c, players));
  w = actWorld(w, 'cam', { t: 'mark', i: 0, ok: true }, ctxOf(c, players));
  ok('a repeated mark counts once', w.pub.results.length === 1 && w.pub.scores.cam === 1);
  w = actWorld(w, 'cam', { t: 'mark', i: 1, ok: false }, ctxOf(c, players));
  w = actWorld(w, 'cam', { t: 'mark', i: 3, ok: true }, ctxOf(c, players));
  ok('passes score nothing and skipped indexes are refused', w.pub.results.join() === '1,0' && w.pub.scores.cam === 1);
  ok('the phone shows the next card from its own count', forehead.currentCard(w.pub, 2) === w.pub.cards[2]);
  c.add(forehead.TURN_MS);
  w = actWorld(w, 'cam', { t: 'mark', i: 2, ok: true }, ctxOf(c, players));
  ok('a mark sent right at the buzzer still counts', w.pub.scores.cam === 2);
  c.add(forehead.LATE_MS + 1);
  w = tickWorld(w, ctxOf(c, players));
  ok('time up moves to the turnover', w.pub.phase === 'turnover');
  w = actWorld(w, 'cam', { t: 'mark', i: 3, ok: true }, ctxOf(c, players));
  ok('no marks after the turn is over', w.pub.scores.cam === 2);
  c.add(forehead.TURNOVER_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('then the next player is up', w.pub.phase === 'ready' && w.pub.guesser === 'bo' && !w.pub.cards);
  w = tickWorld(w, ctxOf(c, [CAM, ASH]));
  ok('a player who left is skipped', w.pub.guesser === 'ash');
  w = tickWorld(w, ctxOf(c, [CAM, ASH, JOSH]));
  ok('a player who arrives late is added to the end', w.vault.order.join() === 'cam,bo,ash,josh' && w.pub.scores.josh === 0);
  w = actWorld(w, 'ash', { t: 'go' }, ctxOf(c, players));
  w = tickWorld(w, ctxOf(c, [CAM, JOSH]));
  ok('a guesser who drops out mid-turn ends their turn', w.pub.phase === 'turnover');
  c.add(forehead.TURNOVER_MS);
  w = tickWorld(w, ctxOf(c, [CAM, JOSH]));
  w = actWorld(w, 'josh', { t: 'go' }, ctxOf(c, [CAM, JOSH]));
  c.add(forehead.COUNTDOWN_MS + forehead.TURN_MS + forehead.LATE_MS + 1);
  w = tickWorld(w, ctxOf(c, [CAM, JOSH]));
  c.add(forehead.TURNOVER_MS);
  w = tickWorld(w, ctxOf(c, [CAM, JOSH]));
  ok('after everyone has gone it is over', w.pub.phase === 'over');
}

/* ── Trivia ──────────────────────────────────────────────────────────────── */
console.log('\ntrivia');
{
  ok('a right answer straight away is worth 200', trivia.pointsFor(0) === 200);
  ok('a right answer at the buzzer is worth 100', trivia.pointsFor(trivia.QUESTION_MS) === 100);
  ok('quicker is always more', trivia.pointsFor(2000) > trivia.pointsFor(9000));

  const c = clock(), players = [CAM, BO, ASH];
  let w = startWorld('trivia', players, { category: 'animals', count: 5 }, ctxOf(c, players));
  ok('starts with an intro', w.pub.phase === 'intro' && w.pub.total === 5);
  ok('the questions come from the category', w.vault.order.every((i) => TRIVIA[i][0] === 'animals'));
  ok('the order has no repeats', new Set(w.vault.order).size === 5);
  c.add(trivia.INTRO_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('then asks question one', w.pub.phase === 'question' && w.pub.n === 0 && w.pub.q.options.length === 4);
  const right = w.vault.answer;
  ok('the answer is in the vault, not the room', right >= 0 && !JSON.stringify(w.pub).includes('"answer"'));
  ok('and the right option is in the list', w.pub.q.options[right] === TRIVIA[w.vault.order[0]][2]);
  const wrong = (right + 1) % 4;
  c.add(1500);
  w = actWorld(w, 'cam', { t: 'answer', pick: right }, ctxOf(c, players));
  c.add(3000);
  w = actWorld(w, 'bo', { t: 'answer', pick: wrong }, ctxOf(c, players));
  w = actWorld(w, 'bo', { t: 'answer', pick: right }, ctxOf(c, players));
  ok('the first answer stands', w.vault.picks.bo.pick === wrong);
  w = actWorld(w, 'ash', { t: 'answer', pick: 9 }, ctxOf(c, players));
  ok('an impossible pick is refused', !w.pub.answered.ash);
  ok('who has answered is public, what they answered is not', w.pub.answered.cam && w.pub.answered.bo && !JSON.stringify(w.pub).includes('pick'));
  w = tickWorld(w, ctxOf(c, players));
  ok('waits while someone has not answered', w.pub.phase === 'question');
  w = tickWorld(w, ctxOf(c, [CAM, BO]));
  ok('unless they have left, then it reveals', w.pub.phase === 'reveal');
  ok('the reveal names the answer and who picked what', w.pub.last.answer === right && w.pub.last.picks.bo === wrong);
  ok('right scores by speed, wrong scores nothing', w.pub.scores.cam === trivia.pointsFor(1500) && w.pub.scores.bo === 0);

  // Played to the end, with answers round-tripped through the database.
  for (let n = 1; n < 5; n++) {
    c.add(trivia.REVEAL_MS);
    w = viaDb(tickWorld(w, ctxOf(c, players)));
    w.secret = w.secret || {}; w.fx = w.fx || [];
    ok(`question ${n + 1} is asked`, w.pub.phase === 'question' && w.pub.n === n);
    w = actWorld(w, 'ash', { t: 'answer', pick: w.vault.answer }, ctxOf(c, players));
    c.add(trivia.QUESTION_MS);
    w = tickWorld(w, ctxOf(c, players));
  }
  ok('the last question reveals on time', w.pub.phase === 'reveal');
  c.add(trivia.REVEAL_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('and then the game is over', w.pub.phase === 'over' && w.pub.scores.ash === 4 * trivia.pointsFor(0));
  const after = actWorld(w, 'cam', { t: 'answer', pick: 0 }, ctxOf(c, players));
  ok('nothing changes once it is over', after === w);
}

/* ── Quick Sketch ────────────────────────────────────────────────────────── */
console.log('\nquick sketch');
{
  ok('a guess is right whatever the case and spacing', sketch.isRight('  Ice-Cream ', 'ice cream'));
  ok('plurals are right', sketch.isRight('apples', 'apple') && sketch.isRight('bus', 'buses') === false && sketch.isRight('buses', 'bus'));
  ok('"a" and "the" in front are fine', sketch.isRight('a cat', 'cat') && sketch.isRight('the moon', 'moon'));
  ok('one letter out on a five-letter word is close', sketch.isClose('pizzo', 'pizza'));
  ok('three-letter words are never close', !sketch.isClose('bat', 'cat'));
  ok('two out on a long word is close', sketch.isClose('helicoptor', 'helicopter') && sketch.isClose('helocoptor', 'helicopter'));
  ok('a right guess is not "close"', !sketch.isClose('pizza', 'pizza'));
  ok('blanks keep the spaces', sketch.mask('ice cream') === '___ _____');
  ok('shown letters show', sketch.mask('cake', [0, 3]) === 'c__e');
  ok('no hints for a three-letter word', sketch.hintsDue(0.9, 'cat') === 0);
  ok('one hint for a short word, two for a long one', sketch.hintsDue(0.9, 'cake') === 1 && sketch.hintsDue(0.9, 'elephant') === 2);
  ok('no hint before 40% of the time', sketch.hintsDue(0.3, 'elephant') === 0);
  const ch = sketch.choicesFrom([], seeded(2));
  ok('three choices, easy, medium and hard', ch.length === 3 && SKETCH_WORDS.easy.includes(ch[0]) && SKETCH_WORDS.hard.includes(ch[2]));

  const c = clock(), players = [CAM, BO, ASH];
  let w = startWorld('sketch', players, { rounds: 1 }, ctxOf(c, players));
  ok('starts with the first player choosing', w.pub.phase === 'choosing' && w.pub.drawer === 'cam' && w.pub.turns === 3);
  ok('only the drawer is sent the choices', w.secret.cam.choices.length === 3 && !w.secret.bo);
  ok('the choices are not in the room', !w.secret.cam.choices.some((x) => JSON.stringify(w.pub).includes(`"${x}"`)));
  ok('a new turn clears the drawing', w.fx.some((f) => f.type === 'clear-strokes'));
  w = actWorld(w, 'bo', { t: 'choose', i: 0 }, ctxOf(c, players));
  ok('only the drawer chooses', w.pub.phase === 'choosing');
  w = actWorld(w, 'cam', { t: 'choose', i: 1 }, ctxOf(c, players));
  const word = w.vault.word;
  ok('choosing starts the drawing', w.pub.phase === 'drawing' && word === w.secret.cam.word);
  ok('the room only has blanks', w.pub.hint === sketch.mask(word) && !JSON.stringify(w.pub).includes(word));
  w = actWorld(w, 'cam', { t: 'guess', text: word }, ctxOf(c, players));
  ok('the drawer cannot guess their own word', !w.pub.solved.cam);
  w = actWorld(w, 'bo', { t: 'guess', text: 'definitely not it' }, ctxOf(c, players));
  ok('a wrong guess goes in the feed', w.pub.feed.at(-1).text === 'definitely not it');
  c.add(10000);
  w = actWorld(w, 'bo', { t: 'guess', text: word.toUpperCase() }, ctxOf(c, players));
  ok('a right guess scores the guesser and the drawer', w.pub.solved.bo === 1 && w.pub.scores.bo === sketch.guessPoints(10000) && w.pub.scores.cam === sketch.DRAWER_POINTS);
  ok('the feed says they got it without saying what it was', w.pub.feed.at(-1).k === 'got' && !JSON.stringify(w.pub.feed).includes(word));
  ok('they are told privately, and now see the word', w.fx.some((f) => f.type === 'note' && f.uid === 'bo') && w.secret.bo.word === word);
  w = actWorld(w, 'bo', { t: 'guess', text: word }, ctxOf(c, players));
  ok('guessing again scores nothing', w.pub.scores.bo === sketch.guessPoints(10000));
  w.fx = [];
  const near = word.length >= 4 ? word.slice(0, -1) + (word.endsWith('z') ? 'y' : 'z') : null;
  if (near && sketch.isClose(near, word)) {
    w = actWorld(w, 'ash', { t: 'guess', text: near }, ctxOf(c, players));
    ok('a near miss is a private note, not a public hint', w.fx.some((f) => f.uid === 'ash' && /close/.test(f.text)) && !JSON.stringify(w.pub.feed).includes(near));
  }
  c.add(sketch.DRAW_MS * 0.75);
  w = tickWorld(w, ctxOf(c, players));
  ok('hints appear as time runs down', w.pub.hint !== sketch.mask(word) || sketch.hintsDue(0.9, word) === 0);
  w = actWorld(w, 'ash', { t: 'guess', text: word }, ctxOf(c, players));
  w = tickWorld(w, ctxOf(c, players));
  ok('when everyone has it the word is revealed', w.pub.phase === 'reveal' && w.pub.word === word);
  c.add(sketch.REVEAL_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('then the next person draws', w.pub.phase === 'choosing' && w.pub.drawer === 'bo' && w.pub.turn === 1);
  ok('and last turn\'s secrets are wiped', w.secret.cam === null && w.secret.ash === null && w.secret.bo.choices);
  ok('the feed starts empty', w.pub.feed.length === 0);
  c.add(sketch.CHOOSE_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('a drawer who does not choose gets the easy word', w.pub.phase === 'drawing' && w.vault.word === w.vault.choices[0]);
  w = tickWorld(w, ctxOf(c, [CAM, ASH]));
  ok('a drawer who leaves ends the turn', w.pub.phase === 'reveal');
  c.add(sketch.REVEAL_MS);
  w = tickWorld(w, ctxOf(c, [CAM, ASH]));
  ok('the next drawer is up', w.pub.drawer === 'ash');
  w = actWorld(w, 'ash', { t: 'choose', i: 2 }, ctxOf(c, [CAM, ASH]));
  c.add(sketch.DRAW_MS);
  w = tickWorld(w, ctxOf(c, [CAM, ASH]));
  ok('time running out reveals the word', w.pub.phase === 'reveal');
  c.add(sketch.REVEAL_MS);
  w = tickWorld(w, ctxOf(c, [CAM, ASH]));
  ok('after the last drawer the game is over', w.pub.phase === 'over');
  ok('nobody is offered the same word twice', new Set(w.vault.used).size === w.vault.used.length);
}

/* ── Chips & Dip ─────────────────────────────────────────────────────────── */
console.log('\nchips & dip');
{
  const c = clock(), players = [CAM, BO, ASH, JOSH];
  let w = startWorld('chips', players, { target: 3 }, ctxOf(c, players));
  ok('everyone gets a hand of five', players.every((p) => w.secret[p.uid].hand.length === 5));
  const dealt = players.flatMap((p) => w.secret[p.uid].hand);
  ok('no dip is dealt twice', new Set(dealt).size === dealt.length);
  ok('round one: two chips, Cam judges', w.pub.chips.length === 2 && w.pub.judge === 'cam' && w.pub.phase === 'playing');
  ok('hands are not in the room', !dealt.some((d) => JSON.stringify(w.pub).includes(d)));
  w = actWorld(w, 'cam', { t: 'play', i: 0 }, ctxOf(c, players));
  ok('the judge does not play', !w.pub.played.cam);
  const boCard = w.secret.bo.hand[2];
  w = actWorld(w, 'bo', { t: 'play', i: 2 }, ctxOf(c, players));
  w = actWorld(w, 'bo', { t: 'play', i: 0 }, ctxOf(c, players));
  ok('a play takes the card out of your hand, once', w.secret.bo.hand.length === 4 && w.secret.bo.played === boCard && w.vault.plays.bo === boCard);
  w = actWorld(w, 'ash', { t: 'play', i: 7 }, ctxOf(c, players));
  ok('a card you do not have cannot be played', !w.pub.played.ash);
  w = actWorld(w, 'ash', { t: 'play', i: 0 }, ctxOf(c, players));
  ok('still playing while Josh has not', w.pub.phase === 'playing');
  w = actWorld(w, 'josh', { t: 'play', i: 4 }, ctxOf(c, players));
  ok('everyone in: on to the judge', w.pub.phase === 'judging' && w.pub.table.length === 3);
  ok('the table has no names on it', !JSON.stringify(w.pub).match(/"(bo|ash|josh)":"/) && !w.pub.reveal);
  w = actWorld(w, 'bo', { t: 'pick', i: 0 }, ctxOf(c, players));
  ok('only the judge picks', w.pub.phase === 'judging');
  const boAt = w.pub.table.indexOf(boCard);
  w = actWorld(w, 'cam', { t: 'pick', i: boAt }, ctxOf(c, players));
  ok('the pick scores whoever played it', w.pub.phase === 'reveal' && w.pub.winner.uid === 'bo' && w.pub.scores.bo === 1);
  ok('the reveal names everyone\'s dip', w.pub.reveal.length === 3 && w.pub.reveal.find((r) => r.uid === 'bo').card === boCard);
  c.add(chips.REVEAL_MS);
  w = viaDb(tickWorld(w, ctxOf(c, players)));
  w.secret = w.secret || {}; w.fx = [];
  ok('round two: the next player judges', w.pub.round === 2 && w.pub.judge === 'bo' && w.pub.phase === 'playing');
  ok('hands are topped back up', players.every((p) => w.vault.hands[p.uid].length === 5));
  ok('fresh chips', w.pub.chips.length === 2);
  w = actWorld(w, 'cam', { t: 'play', i: 0 }, ctxOf(c, players));
  c.add(chips.PLAY_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('time up takes whatever was played to the judge', w.pub.phase === 'judging' && w.pub.table.length === 1);
  c.add(chips.JUDGE_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('a judge who never picks gets a random pick', w.pub.phase === 'reveal' && w.pub.auto && w.pub.scores.cam === 1);
  c.add(chips.REVEAL_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('round three: Ash judges', w.pub.judge === 'ash');
  w = tickWorld(w, ctxOf(c, [CAM, BO, JOSH]));
  ok('a judge who leaves passes the chair on', w.pub.judge !== 'ash' && w.pub.phase === 'playing');
  ok('nextJudge wraps round', chips.nextJudge([CAM, BO], 'bo') === 'cam');
  // Play it out until someone reaches the target.
  let guard = 0;
  while (w.pub.phase !== 'over' && guard++ < 40) {
    const ps = [CAM, BO, JOSH];
    if (w.pub.phase === 'playing') for (const p of ps) w = actWorld(w, p.uid, { t: 'play', i: 0 }, ctxOf(c, ps));
    if (w.pub.phase === 'judging') w = actWorld(w, w.pub.judge, { t: 'pick', i: 0 }, ctxOf(c, ps));
    c.add(chips.REVEAL_MS);
    w = tickWorld(w, ctxOf(c, ps));
  }
  ok('first to the target wins', w.pub.phase === 'over' && Math.max(...Object.values(w.pub.scores)) === 3);
  const late = tickWorld(startWorld('chips', [CAM, BO, ASH], {}, ctxOf(c, [CAM, BO, ASH])), ctxOf(c, [CAM, BO, ASH, JOSH]));
  ok('somebody who arrives mid-game is dealt in', late.secret.josh.hand.length === 5 && late.pub.scores.josh === 0);
}

/* ── Word Race ───────────────────────────────────────────────────────────── */
console.log('\nword race');
{
  const bad = ['sex', 'crap', 'damn', 'hell', 'piss', 'butt', 'slut', 'rape', 'nazi', 'turd', 'tits'];
  ok('there are hundreds of puzzles', PUZZLES.length >= 300);
  ok('every puzzle has eight letters', PUZZLES.every(([k]) => /^[a-z]{8}$/.test(k)));
  ok('every answer can be made from its letters, three to eight long', PUZZLES.every(([k, c, r]) => `${c} ${r}`.trim().split(' ').every((w) => w.length >= 3 && w.length <= 8 && race.canMake(w, k))));
  ok('every puzzle has a word that uses all eight', PUZZLES.every(([, c]) => c.split(' ').some((w) => w.length === 8)));
  ok('no puzzle lists a word twice', PUZZLES.every(([, c, r]) => { const a = `${c} ${r}`.trim().split(' '); return new Set(a).size === a.length; }));
  ok('nothing rude is an answer', PUZZLES.every(([, c, r]) => !`${c} ${r}`.split(' ').some((w) => bad.includes(w))));
  ok('a letter can only be used as often as it appears', race.canMake('bee', 'abegilnr') === false && race.canMake('been', 'abegilnr') === false && race.canMake('bring', 'abegilnr'));
  ok('longer words are worth a lot more', race.pointsFor('cat') === 100 && race.pointsFor('planets') > 3 * race.pointsFor('cats'));
  ok('the phone refuses short words, missing letters and repeats itself', /3 letters/.test(race.localProblem('at', 'abcdefgh', [])) && /wheel/.test(race.localProblem('zzz', 'abcdefgh', [])) && /Already/.test(race.localProblem('bad', 'abcdefgh', ['bad'])));
  ok('round points add the first-to bonuses', JSON.stringify(race.roundPoints({ a: ['cat', 'tiger'] }, { 5: 'a' })) === JSON.stringify({ a: 100 + 400 + race.FIRST_BONUS[5] }));

  const c = clock(), players = [CAM, BO, ASH];
  let w = startWorld('race', players, { rounds: 3 }, ctxOf(c, players));
  const pz = () => race.puzzle(w.vault.order[w.pub.round - 1]);
  ok('starts with an intro to round one', w.pub.phase === 'intro' && w.pub.round === 1 && w.pub.letters.length === 8);
  ok('the letters are the puzzle\'s, shuffled', [...w.pub.letters].sort().join('') === pz().key);
  ok('no answers in the room', !pz().common.some((x) => x.length > 4 && JSON.stringify(w.pub).includes(`"${x}"`)));
  w = actWorld(w, 'cam', { t: 'word', w: pz().common[0] }, ctxOf(c, players));
  ok('no words before the round starts', !w.vault.found.cam);
  c.add(race.INTRO_MS);
  w = tickWorld(w, ctxOf(c, players));
  ok('then the race is on', w.pub.phase === 'playing' && w.pub.deadline === c.now() + race.ROUND_MS);
  const three = pz().common.find((x) => x.length === 3) || pz().common[0];
  const five = pz().common.find((x) => x.length === 5);
  const eight = pz().common.find((x) => x.length === 8);
  w = actWorld(w, 'cam', { t: 'word', w: three.toUpperCase() }, ctxOf(c, players));
  ok('a real word counts, whatever the case', w.secret.cam.found.includes(three) && w.secret.cam.last.ok && w.pub.counts.cam === 1);
  w = actWorld(w, 'cam', { t: 'word', w: three }, ctxOf(c, players));
  ok('the same word twice does not', w.secret.cam.found.length === 1 && !w.secret.cam.last.ok);
  w = actWorld(w, 'cam', { t: 'word', w: 'zzzzz' }, ctxOf(c, players));
  ok('letters not on the wheel are refused', /wheel/.test(w.secret.cam.last.why));
  const fake = [...w.pub.letters].slice(0, 4).join('');
  if (!pz().common.includes(fake) && !pz().rare.includes(fake)) {
    w = actWorld(w, 'cam', { t: 'word', w: fake }, ctxOf(c, players));
    ok('a jumble of the right letters is not a word', /dictionary/.test(w.secret.cam.last.why));
  }
  w = actWorld(w, 'bo', { t: 'word', w: three }, ctxOf(c, players));
  ok('two people can find the same word', w.secret.bo.found.includes(three));
  if (five) {
    w = actWorld(w, 'bo', { t: 'word', w: five }, ctxOf(c, players));
    ok('the first five-letter word earns the bonus', w.pub.firsts[5] === 'bo' && w.secret.bo.last.first && w.secret.bo.last.pts === 400 + race.FIRST_BONUS[5]);
    w = actWorld(w, 'cam', { t: 'word', w: five }, ctxOf(c, players));
    ok('the second one does not', w.pub.firsts[5] === 'bo' && !w.secret.cam.last.first);
  }
  ok('who got each first is public, the word is not', !JSON.stringify(w.pub).includes(`"${five}"`));
  w = actWorld(w, 'ash', { t: 'word', w: eight }, ctxOf(c, players));
  ok('finding the eight is the jackpot', w.pub.firsts[8] === 'ash' && w.secret.ash.last.pts === 1600 + race.FIRST_BONUS[8]);
  c.add(race.ROUND_MS + race.LATE_MS + 1);
  w = actWorld(w, 'cam', { t: 'word', w: eight }, ctxOf(c, players));
  ok('nothing counts after the buzzer', !w.secret.cam.found.includes(eight));
  w = tickWorld(w, ctxOf(c, players));
  const rv = w.pub.reveal;
  ok('time up reveals every word and who found it', w.pub.phase === 'reveal' && rv.common.length === pz().common.length && rv.common.find((x) => x.w === three).by.length === 2);
  ok('the round goes to the best score', rv.winners.join() === 'ash' && w.pub.wins.ash === 1);
  ok('round points go on the scoreboard', w.pub.scores.ash === rv.points.ash && w.pub.scores.cam === rv.points.cam);
  c.add(race.REVEAL_MS);
  w = viaDb(tickWorld(w, ctxOf(c, players)));
  w.secret = w.secret || {}; w.fx = [];
  ok('round two has new letters and a clean slate', w.pub.round === 2 && w.pub.phase === 'intro' && !w.pub.counts && !w.pub.firsts);
  for (let r = 2; r <= 3; r++) {
    c.add(race.INTRO_MS); w = tickWorld(w, ctxOf(c, players));
    c.add(race.ROUND_MS + race.LATE_MS); w = tickWorld(w, ctxOf(c, players));
    if (r === 2) ok('a round where nobody scores has no winner', w.pub.reveal.winners.length === 0);
    c.add(race.REVEAL_MS); w = tickWorld(w, ctxOf(c, players));
  }
  ok('after three rounds it is over', w.pub.phase === 'over');
  const late = tickWorld(startWorld('race', [CAM], {}, ctxOf(c, [CAM])), ctxOf(c, [CAM, JOSH]));
  ok('somebody who arrives mid-game is on the scoreboard', late.pub.scores.josh === 0);
}

/* ── the video call ──────────────────────────────────────────────────────── */
console.log('\nvideo call');
{
  const players = { a: P('a', 'A', 1), b: P('b', 'B', 2), c: P('c', 'C', 3), d: { ...P('d', 'D', 4), online: false } };
  const media = {
    b: { on: true, since: 10, sid: 'sb' },
    a: { on: true, since: 20, sid: 'sa' },
    c: { on: true, since: 30, sid: 'sc' },
    d: { on: true, since: 5, sid: 'sd' },
  };
  ok('the call is in the order people turned video on', onCall(media, players).join() === 'b,a,c');
  ok('someone whose phone dropped out of the room is not on it', !onCall(media, players).includes('d'));
  ok('nobody without a session is on it', !onCall({ a: { on: true, since: 1 } }, players).length);
  const many = {}, crowd = {};
  for (let i = 0; i < 8; i++) { crowd[`u${i}`] = P(`u${i}`, `U${i}`, i); many[`u${i}`] = { on: true, since: i, sid: `s${i}` }; }
  ok(`the call stops at ${CAP}`, onCall(many, crowd).length === CAP && onCall(many, crowd).at(-1) === `u${CAP - 1}`);
  ok('the seventh is told it is full, the first six are not', isFull(many, crowd, 'u6') && !isFull(many, crowd, 'u0'));
  ok('exactly one side of each pair makes the offer', offers('a', 'b') !== offers('b', 'a'));
  const first = plan('a', media, players, {});
  ok('a new call connects to everyone else on it', first.connect.sort().join() === 'b,c' && !first.drop.length);
  ok('a live connection is left alone', !plan('a', media, players, { b: 'sb', c: 'sc' }).connect.length);
  const reloaded = plan('a', { ...media, b: { ...media.b, sid: 'sb2' } }, players, { b: 'sb', c: 'sc' });
  ok('someone who reloaded is hung up on and called again', reloaded.drop.join() === 'b' && reloaded.connect.join() === 'b');
  const { c: _gone, ...left } = media;
  ok('someone who left the call is hung up on', plan('a', left, players, { b: 'sb', c: 'sc' }).drop.join() === 'c');
  ok('if you are not on the call you hang up on everyone', plan('d', media, players, { a: 'sa' }).drop.join() === 'a');
  ok('a setup message for this session is used', forMe({ t: 'offer', d: 'v=0', to: 'me1' }, 'me1'));
  ok('one left over from before a reload is not', !forMe({ t: 'offer', d: 'v=0', to: 'old' }, 'me1'));
  ok('nor is anything that is not an offer, answer or candidate', !forMe({ t: 'bye', d: '', to: 'me1' }, 'me1'));
  const r = seeded(9);
  ok('session ids are fresh each time', newSid(r) !== newSid(r));
}

/* ── the host loop ───────────────────────────────────────────────────────── */
console.log('\nhost');
{
  const writes = [];
  const fake = {
    writeGame: async (v) => writes.push(['game', v]),
    writeVault: async (v) => writes.push(['vault', v]),
    writeSecret: async (u, v) => writes.push(['secret', u, v]),
    writeNote: async (u, t) => writes.push(['note', u, t]),
    clearStrokes: async () => writes.push(['clear']),
    endGame: async () => writes.push(['end']),
  };
  const c = clock();
  let online = [CAM, BO];
  const host = new Host(fake, { players: () => online, now: c.now, rand: seeded(4) });
  await host.start('sketch', { rounds: 1 });
  const kinds = writes.map((x) => x[0]);
  ok('starting writes the drawer\'s secret before the room', kinds.indexOf('secret') < kinds.indexOf('game'));
  ok('and clears the old drawing', kinds.includes('clear'));
  ok('the options are kept so the game can be played again', host.world.pub.opts.rounds === 1);
  writes.length = 0;
  await host.tick();
  ok('a tick that changes nothing writes nothing', writes.length === 0);
  await host.act('cam', { t: 'choose', i: 0 });
  ok('a change writes only what changed', writes.some((x) => x[0] === 'game') && writes.filter((x) => x[0] === 'secret').length === 1);
  writes.length = 0;
  await host.act('bo', { t: 'guess', text: host.world.vault.word });
  ok('a private note goes out as a note', writes.some((x) => x[0] === 'note' && x[1] === 'bo'));

  // Another phone takes over from what the room and the vault held.
  const next = new Host(fake, { players: () => online, now: c.now, rand: seeded(5) });
  next.resume(viaDb(host.world.pub), viaDb(host.world.vault));
  writes.length = 0;
  c.add(sketch.DRAW_MS);
  await next.tick();
  ok('a new host carries on the same game', next.world.pub.phase === 'reveal' && next.world.pub.word === host.world.vault.word);
  ok('resuming with nothing to resume does nothing', (next.resume(null, null), next.world === null));
  await host.stop();
  ok('stopping ends the game in the room', writes.at(-1)[0] === 'end' && host.world === null);
}

/* ── every game survives a database round trip at every step ─────────────── */
console.log('\nround trips');
{
  for (const id of Object.keys(ENGINES)) {
    const c = clock(), players = [CAM, BO, ASH];
    let w = startWorld(id, players, {}, ctxOf(c, players, 11));
    let crashed = null;
    try {
      for (let i = 0; i < 2000 && w.pub.phase !== 'over'; i++) {
        w = viaDb(w); w.secret = w.secret || {}; w.fx = w.fx || []; w.vault = w.vault || {};
        const who = players[i % 3].uid;
        const msgs = [{ t: 'go' }, { t: 'mark', i: (w.pub.results || []).length, ok: i % 2 === 0 }, { t: 'answer', pick: i % 4 },
          { t: 'choose', i: 0 }, { t: 'guess', text: 'x' }, { t: 'play', i: 0 }, { t: 'pick', i: 0 },
          { t: 'word', w: w.pub.letters ? w.pub.letters.slice(0, 3 + (i % 5)) : '' }];
        w = actWorld(w, who, msgs[i % msgs.length], ctxOf(c, players, i));
        c.add(4000);
        w = tickWorld(w, ctxOf(c, players, i));
      }
    } catch (e) { crashed = e; }
    ok(`${id} plays to the end through the database without crashing`, !crashed && w.pub.phase === 'over', crashed ? crashed.stack.split('\n').slice(0, 2).join(' ') : w.pub.phase);
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
