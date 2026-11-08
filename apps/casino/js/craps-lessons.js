/* Learn craps: the tutorial, as data. Each lesson is a few short
 * paragraphs, an optional live demo (real dice, rolled on your phone), and
 * one question to check it landed. trainers-craps.js draws them.
 *
 * Demo kinds:
 *   dice      roll two dice as often as you like; a chart of the 36 ways
 *   tally     roll 100 at a time and watch the totals pile up like the chart
 *   line      a pass line bet played out roll by roll, explained as it goes
 *   odds      the same, with odds taken once the point is set
 *   dont      the same from the don't pass side
 */

export const LESSONS = [
  {
    id: 'dice', title: 'Two dice, 36 ways',
    body: [
      'Craps is one shooter rolling two dice, and everyone at the table betting on what comes up. That is all the game is.',
      'Two dice can land 36 ways. Only one of them makes 2 (⚀⚀) and only one makes 12 (⚅⚅), but six of them make 7. **7 is the most common roll**, about one roll in six, and the whole game is built around it.',
      'The numbers come in pairs that are equally likely: 6 and 8 (five ways each), 5 and 9 (four), 4 and 10 (three).',
    ],
    demo: 'tally',
    quiz: { q: 'Which total comes up most often?', options: ['6', '7', '8', 'They are all the same'], answer: 1, why: 'Six of the 36 ways make 7: 1+6, 2+5, 3+4, 4+3, 5+2, 6+1.' },
  },
  {
    id: 'comeout', title: 'The come-out roll',
    body: [
      'A round starts with the **come-out roll**. Before it, most people put a bet on the **pass line**: you are betting with the shooter.',
      'On the come-out, **7 or 11 wins** right away (a "natural"). **2, 3 or 12 loses** right away ("craps").',
      'Any other number (4, 5, 6, 8, 9 or 10) becomes **the point**. The dealer moves a puck onto that number and flips it to **ON**.',
    ],
    demo: 'line',
    quiz: { q: 'On the come-out, the shooter rolls an 11. Your pass line bet…', options: ['Wins', 'Loses', 'Becomes the point', 'Nothing happens'], answer: 0, why: '7 and 11 are naturals: the pass line wins on the come-out.' },
  },
  {
    id: 'point', title: 'Making the point',
    body: [
      'Once there is a point, the shooter keeps rolling until one of two things happens: **the point again** (pass line wins, even money) or **a 7** (pass line loses). Nothing else matters to the pass line.',
      'Rolling a 7 here is called **seven-out**. The round ends, and the dice go to the next shooter.',
      'Yes: 7 wins on the come-out but loses once there is a point. Over a whole round the pass line wins 49.3% of the time, so the house keeps **1.41%** of what you bet. That is one of the best bets in the casino.',
      'Easy points come up more: a 6 or 8 is made before a 7 45% of the time; a 4 or 10 only 33%.',
    ],
    demo: 'line',
    quiz: { q: 'The point is 6. The shooter rolls an 8, then a 6. Your pass line bet…', options: ['Lost on the 8', 'Wins on the 6', 'Is still waiting', 'Pushes'], answer: 1, why: 'Only the point (6) or a 7 settles the pass line. The 8 did nothing.' },
  },
  {
    id: 'odds', title: 'Odds: the best bet in the casino',
    body: [
      'Once there is a point you can put more money **behind** your pass line bet, called **taking odds**. It wins and loses with the pass line, but pays **true odds**: 2 to 1 on 4 and 10, 3 to 2 on 5 and 9, 6 to 5 on 6 and 8.',
      'True odds means **the house has no edge at all** on this money. It isn\'t printed on the table, and nobody will tell you about it, but it is the reason experienced players love craps.',
      'Tables cap it as a multiple of your line bet. This one uses "3-4-5x": 3x on 4/10, 4x on 5/9, 5x on 6/8. A small pass line with full odds is how to play: most of your money sits on a bet with no house edge.',
    ],
    demo: 'odds',
    quiz: { q: 'Point is 6. You have $10 odds behind the pass line and the 6 rolls. The odds pay…', options: ['$10', '$12', '$15', '$20'], answer: 1, why: '6 and 8 pay 6 to 5 on odds: $10 × 6/5 = $12.' },
  },
  {
    id: 'come', title: 'Come bets',
    body: [
      'A **come bet** is a pass line bet you make after the point is set. The very next roll is its own come-out: 7 or 11 wins, 2, 3 or 12 loses, and any other number moves your bet onto that number.',
      'From then on it wins if that number rolls before a 7, and you can take odds on it too. Come odds are "off" on the come-out roll, so a 7 then just gives them back.',
      'A pass line plus two come bets, all with odds, keeps three numbers working for you at once. It\'s a popular way to get more action without paying a worse edge.',
    ],
    demo: null,
    quiz: { q: 'Point is 5. You make a come bet and the shooter rolls a 9. Your come bet…', options: ['Wins', 'Loses', 'Moves to the 9', 'Moves to the 5'], answer: 2, why: 'A come bet treats the next roll as its own come-out. A 9 becomes its number.' },
  },
  {
    id: 'place', title: 'Place bets',
    body: [
      '**Place bets** let you pick a number yourself: it wins every time that number rolls before a 7, and stays up after it wins. They are off on the come-out.',
      'They don\'t pay true odds, so the house takes a cut: **6 and 8 pay 7 to 6 (1.52% edge)**, 5 and 9 pay 7 to 5 (4%), 4 and 10 pay 9 to 5 (6.67%).',
      'Place 6 and 8 are fine bets. Bet them in $6 units, because 7 to 6 on $5 gets rounded down. The 4 and 10 are better played as come bets with odds.',
    ],
    demo: null,
    quiz: { q: 'Which place bets have the lowest house edge?', options: ['4 and 10', '5 and 9', '6 and 8', 'They are all the same'], answer: 2, why: '6 and 8 keep 1.52%; 5 and 9 keep 4%; 4 and 10 keep 6.67%.' },
  },
  {
    id: 'dont', title: 'The dark side: don\'t pass',
    body: [
      '**Don\'t pass** is the mirror image: 2 or 3 wins on the come-out, 7 or 11 loses, and 12 is a tie (that tie is the house\'s edge). After a point is set, **a 7 wins** and the point loses.',
      'It keeps a hair less than the pass line (1.36%), and you can **lay odds** behind it, again with no edge. You lay more to win less, because the 7 is likely.',
      'It\'s a perfectly good bet, but you are betting against the shooter while everyone else is rooting for them. Win quietly.',
    ],
    demo: 'dont',
    quiz: { q: 'Point is 4 and you bet don\'t pass. The shooter rolls a 7. You…', options: ['Win', 'Lose', 'Push', 'Move to the 7'], answer: 0, why: 'After the point is set, the 7 wins for don\'t pass.' },
  },
  {
    id: 'center', title: 'The field and the middle',
    body: [
      'The **field** is a one-roll bet on 2, 3, 4, 9, 10, 11 or 12, with 2 and 12 paying extra. It looks like a lot of numbers, but 5, 6, 7 and 8 are the common ones. The edge is 2.78% (5.56% where 12 pays only double).',
      'The middle of the table holds **proposition bets**: any 7, any craps, yo (11), hardways and more. Big payouts, but they keep **9% to 17%** of every bet. Any 7 is the worst bet on the table.',
      'The layout here colours every spot by its edge, so you can always see where the house makes its money.',
    ],
    demo: null,
    quiz: { q: 'Which of these keeps the most of your money?', options: ['Pass line', 'Place 8', 'Field', 'Any 7'], answer: 3, why: 'Any 7 pays 4 to 1 on a 5 to 1 shot: the house keeps 16.67%.' },
  },
  {
    id: 'play', title: 'How to play it well',
    body: [
      '1. **Pass line** on the come-out (or don\'t pass, if you like the dark side).',
      '2. When a point is set, **take full odds** behind it.',
      '3. For more action, add **come bets with odds**, or **place the 6 and 8**.',
      '4. Treat the middle of the table as entertainment with a price tag.',
      'Craps is fast: around 100 rolls an hour. The edge per bet is small, but the number of bets is big. The stats screen shows how much your betting style has cost you in edge.',
      'Words you\'ll hear: **shooter** (whoever rolls), **seven-out** (7 after a point, dice move on), **yo** (11, said that way so it isn\'t heard as "seven"), **hard** (a number rolled as a pair: 3+3 is a hard 6), **working / off** (whether a bet counts on this roll).',
    ],
    demo: null,
    quiz: null,
  },
];

/* Plain-English story of one roll for one seat, for the narrator. */
export function explain({ total, hard, before, after, event }) {
  const ways = { 2: 'snake eyes', 3: 'ace-deuce', 11: 'yo', 12: 'boxcars' };
  const name = `${total}${hard && [4, 6, 8, 10].includes(total) ? ' (hard)' : ''}${ways[total] ? `, ${ways[total]}` : ''}`;
  if (!before) {
    if (event === 'natural') return `${name} on the come-out: a natural. Pass line wins, don't pass loses.`;
    if (event === 'craps') return `${name} on the come-out: craps. Pass line loses${total === 12 ? ', don\'t pass ties on 12' : ', don\'t pass wins'}.`;
    return `${name} on the come-out. The point is now ${after}: the shooter wants another ${after} before a 7.`;
  }
  if (event === 'hit') return `${name}: the shooter made the point! Pass line and its odds win. Next roll is a new come-out.`;
  if (event === 'sevenout') return `${name}: seven-out. Pass line, come bets and place bets lose; don't bets win. The dice pass to the next shooter.`;
  return `${name}. The point is still ${before}: nothing happens to the pass line.`;
}
