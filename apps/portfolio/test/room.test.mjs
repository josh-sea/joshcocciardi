/* "1 to 10" across phones: rooms, roles and turn order.
 *
 * The whole game is "only one person knows the number", so the interesting
 * cases here are the ones where somebody could act out of turn or see
 * something they should not. Pure state, no network, so all of it runs here.
 */

import {
  CODE_ALPHABET, CODE_LENGTH, makeCode, normaliseCode, isValidCode, codeProblem,
  cleanName, nameProblem, MAX_NAME,
  freshRound, playerIds, guesserIds, isPicker,
  canSetNumber, canAsk, canAnswer, canGuess, canOpenGuessing, canReveal,
  everyoneGuessed, nextPicker, canStart, MIN_PLAYERS, whatNow,
} from '../../disney-trivia/js/room.js';

let failures = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};

/* ── codes ───────────────────────────────────────────────────────────────── */
console.log('\nroom codes');
{
  const codes = Array.from({ length: 2000 }, () => makeCode());
  ok('always the right length', codes.every((c) => c.length === CODE_LENGTH));
  ok('always from the alphabet', codes.every(isValidCode));
  ok('there is real spread', new Set(codes).size > 1900, new Set(codes).size);

  // The lookalikes are the whole reason the alphabet is what it is.
  for (const c of ['O', '0', 'I', '1', 'L']) {
    ok(`never contains ${c}`, !CODE_ALPHABET.includes(c));
  }
  ok('no code contains a lookalike', codes.every((c) => !/[O0I1L]/.test(c)));
}
{
  ok('lower case is lifted', normaliseCode('abcde') === 'ABCDE');
  ok('spaces go', normaliseCode('AB CDE') === 'ABCDE');
  ok('hyphens go', normaliseCode('AB-CDE') === 'ABCDE');
  ok('punctuation goes', normaliseCode('A.B,C!D?E') === 'ABCDE');
  ok('nothing is empty', normaliseCode(null) === '');
}
{
  ok('a real code has no problem', codeProblem(makeCode()) === null);
  ok('empty asks for one', /type the room code/i.test(codeProblem('')));
  ok('short says the length', /5 characters/.test(codeProblem('ABC')));
  ok('long says the length', /5 characters/.test(codeProblem('ABCDEFG')));
  // The helpful bit: name the character rather than saying "invalid".
  const o = codeProblem('ABOCD');
  ok('a lookalike is named', /\bO\b/.test(o), o);
  ok('and the likely fix is offered', /really a/.test(o), o);
}

/* ── names ───────────────────────────────────────────────────────────────── */
console.log('\nplayer names');
{
  ok('trimmed', cleanName('  Cam  ') === 'Cam');
  ok('inner runs collapse', cleanName('Cam    B') === 'Cam B');
  ok('capped', cleanName('x'.repeat(50)).length === MAX_NAME);
  ok('nothing is empty', cleanName(null) === '');

  ok('a good name passes', nameProblem('Cam', ['Bo']) === null);
  ok('empty is refused', nameProblem('') !== null);
  ok('one letter is refused', nameProblem('C') !== null);
  ok('a duplicate is refused', /already has that name/.test(nameProblem('Bo', ['Bo'])));
  ok('and case does not dodge it', /already has that name/.test(nameProblem('bo', ['Bo'])));
  ok('but a different name is fine', nameProblem('Bodhi', ['Bo']) === null);
}

/* ── a room ──────────────────────────────────────────────────────────────── */
const room = (over = {}) => ({
  code: 'ABCDE',
  players: { u1: { name: 'Cam', score: 0 }, u2: { name: 'Bo', score: 0 }, u3: { name: 'Dad', score: 0 } },
  round: freshRound(1, 'u1'),
  ...over,
});

console.log('\nwho is who');
{
  const r = room();
  ok('players are listed', playerIds(r).sort().join() === 'u1,u2,u3');
  ok('the picker is the picker', isPicker(r, 'u1'));
  ok('others are not', !isPicker(r, 'u2'));
  ok('guessers exclude the picker', guesserIds(r).sort().join() === 'u2,u3');
  ok('two people is enough to play', canStart(r));
  ok('one is not', !canStart(room({ players: { u1: { name: 'Cam' } } })));
  ok('and the minimum is stated', MIN_PLAYERS === 2);
}

/* ── picking ─────────────────────────────────────────────────────────────── */
console.log('\npicking the number');
{
  const r = room();
  ok('the picker may set it', canSetNumber(r, 'u1'));
  ok('nobody else may', !canSetNumber(r, 'u2') && !canSetNumber(r, 'u3'));
  // Nothing else can happen until they have.
  ok('no asking yet', !canAsk(r, 'u2'));
  ok('no guessing yet', !canGuess(r, 'u2'));
  ok('and no revealing', !canReveal(r, 'u1'));
}

/* ── asking and answering ────────────────────────────────────────────────── */
console.log('\nasking and answering');
{
  const r = room();
  r.round.phase = 'asking';

  ok('a guesser may ask', canAsk(r, 'u2'));
  ok('and so may the other one', canAsk(r, 'u3'));
  ok('the picker may not ask themselves', !canAsk(r, 'u1'));
  ok('nothing to answer yet', !canAnswer(r, 'u1'));
  // The picker has to have answered something before calling for guesses.
  ok('cannot open guessing with nothing asked', !canOpenGuessing(r, 'u1'));

  r.round.questions.push({ topic: 'Desserts in Magic Kingdom', askedBy: 'u2', answer: null });
  ok('now the picker may answer', canAnswer(r, 'u1'));
  ok('but a guesser may not answer', !canAnswer(r, 'u2'));
  // One question at a time, or two people ask at once and the answers
  // stop lining up with the questions.
  ok('no second question until the first is answered', !canAsk(r, 'u2') && !canAsk(r, 'u3'));
  ok('and still cannot open guessing', !canOpenGuessing(r, 'u1'));

  r.round.questions[0].answer = 'Dole Whip';
  ok('answered, so asking reopens', canAsk(r, 'u3'));
  ok('the picker has nothing left to answer', !canAnswer(r, 'u1'));
  ok('and may now open guessing', canOpenGuessing(r, 'u1'));
  ok('but a guesser may not open guessing', !canOpenGuessing(r, 'u2'));

  // An empty answer is not an answer.
  const r2 = room();
  r2.round.phase = 'asking';
  r2.round.questions.push({ topic: 'x', askedBy: 'u2', answer: '' });
  ok('an empty string still counts as answered', canAsk(r2, 'u2'), 'empty is a deliberate choice');
}

/* ── guessing ────────────────────────────────────────────────────────────── */
console.log('\nguessing');
{
  const r = room();
  r.round.phase = 'guessing';

  ok('a guesser may guess', canGuess(r, 'u2'));
  ok('the picker may not guess their own number', !canGuess(r, 'u1'));
  ok('not everyone has guessed', !everyoneGuessed(r));
  ok('so the picker cannot reveal', !canReveal(r, 'u1'));

  r.round.guesses.u2 = 7;
  ok('having guessed, you cannot guess again', !canGuess(r, 'u2'));
  ok('but the other one still can', canGuess(r, 'u3'));
  ok('still not everyone', !everyoneGuessed(r));

  r.round.guesses.u3 = 4;
  ok('now everyone has', everyoneGuessed(r));
  ok('so the picker may reveal', canReveal(r, 'u1'));
  ok('and a guesser may not', !canReveal(r, 'u2'));

  // A guess of zero is a real guess, not a missing one.
  const r2 = room();
  r2.round.phase = 'guessing';
  r2.round.guesses = { u2: 0, u3: 0 };
  ok('a zero guess still counts as having guessed', everyoneGuessed(r2));
}
{
  // Nobody to guess means the round can never complete; say so rather
  // than letting the picker reveal to an empty room.
  const solo = room({ players: { u1: { name: 'Cam' } } });
  solo.round.phase = 'guessing';
  ok('a room of one never counts as everyone guessed', !everyoneGuessed(solo));
}

/* ── rotation ────────────────────────────────────────────────────────────── */
console.log('\nwhose turn to pick');
{
  const r = room();
  ok('it moves on', nextPicker(r) === 'u2');
  r.round.pickerUid = 'u2';
  ok('and on', nextPicker(r) === 'u3');
  r.round.pickerUid = 'u3';
  ok('and wraps', nextPicker(r) === 'u1');

  // Somebody leaving must not strand the rotation.
  const gone = room({ players: { u1: { name: 'Cam' }, u3: { name: 'Dad' } } });
  gone.round.pickerUid = 'u2';
  ok('a departed picker still rotates to a real player',
    ['u1', 'u3'].includes(nextPicker(gone)), nextPicker(gone));
  ok('an empty room rotates to nobody', nextPicker(room({ players: {} })) === null);
}

/* ── one instruction per phone ───────────────────────────────────────────── */
console.log('\nwhat each phone is told to do');
{
  const waiting = room({ players: { u1: { name: 'Cam' } } });
  const w = whatNow(waiting, 'u1');
  ok('a lonely room says to share the code', w.do === 'wait' && /ABCDE/.test(w.say), w);
}
{
  const r = room();
  ok('the picker is told to pick', whatNow(r, 'u1').do === 'pick');
  ok('the others are told who is picking', /Cam is picking/.test(whatNow(r, 'u2').say), whatNow(r, 'u2'));

  r.round.phase = 'asking';
  ok('a guesser is told to ask', whatNow(r, 'u2').do === 'ask');
  ok('the picker waits for a question', whatNow(r, 'u1').do === 'wait');

  r.round.questions.push({ topic: 'Lands in EPCOT', askedBy: 'u2', answer: null });
  ok('now the picker is told to answer', whatNow(r, 'u1').do === 'answer');
  ok('and the asker waits', whatNow(r, 'u2').do === 'wait');

  r.round.questions[0].answer = 'France';
  r.round.phase = 'guessing';
  ok('guessers are told to guess', whatNow(r, 'u2').do === 'guess');
  ok('and asked about the right person', /Cam/.test(whatNow(r, 'u2').say));
  ok('the picker waits for guesses', whatNow(r, 'u1').do === 'wait');

  r.round.guesses = { u2: 7, u3: 8 };
  ok('with all guesses in, the picker is told to reveal', whatNow(r, 'u1').do === 'reveal');
  ok('a player who already guessed waits', whatNow(r, 'u2').do === 'wait');

  r.round.phase = 'revealed';
  ok('everyone moves on together', ['u1', 'u2', 'u3'].every((u) => whatNow(r, u).do === 'next'));
}
{
  ok('no room is a no-op, not a crash', whatNow(null, 'u1').do === 'none');
  ok('a room mid-creation does not throw',
    whatNow({ code: 'ABCDE', players: { a: {}, b: {} }, round: null }, 'a').do === 'wait');
}

/* ── the thing the whole game rests on ───────────────────────────────────── */
console.log('\nthe secret stays secret');
{
  /* The room document is readable by every player, by necessity: they all
   * have to see the questions and the answers. So the secret must never be
   * in it until the reveal. This checks the shape the client writes, which
   * is the half of the guarantee that does not live in the rules.
   */
  const r = room();
  const serialised = JSON.stringify(r);
  ok('a fresh round carries no secret', r.round.secret === null);
  ok('and none appears anywhere in the room document', !/"secret":\s*[0-9]/.test(serialised));

  r.round.phase = 'asking';
  r.round.questions.push({ topic: 'Rides in any park', askedBy: 'u2', answer: 'Frozen Ever After' });
  ok('still none once answers are flowing', !/"secret":\s*[0-9]/.test(JSON.stringify(r)));

  r.round.phase = 'guessing';
  r.round.guesses = { u2: 7, u3: 6 };
  ok('and still none while guesses are in', !/"secret":\s*[0-9]/.test(JSON.stringify(r)));

  r.round.phase = 'revealed';
  r.round.secret = 8;
  ok('only at the reveal does it appear', /"secret":8/.test(JSON.stringify(r)));
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
