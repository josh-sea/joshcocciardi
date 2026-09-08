// ---------------------------------------------------------------------------
// Draft Night — static data for a specific league and a specific seat.
//
// League: 10 team, snake, half PPR, 9 starters + 5 bench, seat 2 of 10.
// Ranks are the ESPN 9/2 non-superflex board, cross-checked against
// FantasyPros 9/8. `flag` is a half-PPR adjustment (up / down) or an injury
// note (hurt); `note` is the one-line reason shown next to the name.
// ---------------------------------------------------------------------------

const RAW = `1|Jahmyr Gibbs|RB|DET|6||
2|Bijan Robinson|RB|ATL|11||
3|Ja'Marr Chase|WR|CIN|6||
4|Puka Nacua|WR|LAR|11|hurt|groin
5|Jonathan Taylor|RB|IND|13||
6|Jaxon Smith-Njigba|WR|SEA|11||
7|Christian McCaffrey|RB|SF|8||
8|Amon-Ra St. Brown|WR|DET|6||
9|James Cook III|RB|BUF|7||
10|CeeDee Lamb|WR|DAL|14||
11|Justin Jefferson|WR|MIN|6||
12|De'Von Achane|RB|MIA|6|down|half PPR fade
13|Omarion Hampton|RB|LAC|7||
14|Chase Brown|RB|CIN|6||
15|Saquon Barkley|RB|PHI|10||
16|Derrick Henry|RB|BAL|13|up|TD volume
17|Ashton Jeanty|RB|LV|13|hurt|ankle
18|Drake London|WR|ATL|11||
19|Jeremiyah Love|RB|ARI|14|hurt|HIGH ANKLE
20|A.J. Brown|WR|NE|11||
21|Trey McBride|TE|ARI|14|up|TE cliff
22|Brock Bowers|TE|LV|13|up|last elite TE
23|Nico Collins|WR|HOU|8|up|Higgins ACL
24|Chris Olave|WR|NO|8||
25|Rashee Rice|WR|KC|5||
26|Josh Allen|QB|BUF|7||
27|George Pickens|WR|DAL|14||
28|Kenneth Walker III|RB|KC|5|up|goal line
29|Garrett Wilson|WR|NYJ|13||
30|Breece Hall|RB|NYJ|13|hurt|monitor
31|Javonte Williams|RB|DAL|14|up|
32|Kyren Williams|RB|LAR|11|up|
33|Malik Nabers|WR|NYG|8|hurt|ACL rehab
34|DeVonta Smith|WR|PHI|10||
35|Travis Etienne Jr.|RB|NO|8|up|Kamara MCL
36|Tetairoa McMillan|WR|CAR|5|down|tackles out
37|Zay Flowers|WR|BAL|13|hurt|quad
38|Emeka Egbuka|WR|TB|10|hurt|toe
39|Quinshon Judkins|RB|CLE|11|up|
40|Ladd McConkey|WR|LAC|7|down|half PPR fade
41|Tee Higgins|WR|CIN|6|up|TD equity
42|Colston Loveland|TE|CHI|10||TE pivot
43|Lamar Jackson|QB|BAL|13|up|rushing
44|Davante Adams|WR|LAR|11||
45|Cam Skattebo|RB|NYG|8||
46|D'Andre Swift|RB|CHI|10||
47|Bhayshul Tuten|RB|JAC|7||
48|Jaylen Waddle|WR|DEN|10||
49|Bucky Irving|RB|TB|10||
50|Terry McLaurin|WR|WAS|7||
51|DJ Moore|WR|BUF|7||
52|Tyler Warren|TE|IND|13||TE backstop
53|Jameson Williams|WR|DET|6||
54|Rome Odunze|WR|CHI|10||
55|Jayden Daniels|QB|WAS|7|up|rushing
56|Drake Maye|QB|NE|11|up|
57|David Montgomery|RB|HOU|8|up|
58|Jadarian Price|RB|SEA|11||
59|Luther Burden III|WR|CHI|10||
60|TreVeyon Henderson|RB|NE|11||
61|Carnell Tate|WR|TEN|9||
62|Mike Evans|WR|SF|8|up|TD equity
63|Marvin Harrison Jr.|WR|ARI|14||
64|Joe Burrow|QB|CIN|6||
65|Rhamondre Stevenson|RB|NE|11||
66|Jalen Hurts|QB|PHI|10|up|rushing
67|Michael Pittman Jr.|WR|PIT|9||
68|Tony Pollard|RB|TEN|9||
69|Harold Fannin Jr.|TE|CLE|11||
70|Kyle Pitts Sr.|TE|ATL|11|up|
71|DK Metcalf|WR|PIT|9|up|
72|George Kittle|TE|SF|8|hurt|Achilles
73|Courtland Sutton|WR|DEN|10|up|
74|Christian Watson|WR|GB|11||
75|Dak Prescott|QB|DAL|14||
76|Parker Washington|WR|JAC|7||
77|Jaylen Warren|RB|PIT|9||
78|Sam LaPorta|TE|DET|6|hurt|hip
79|Kenny Gainwell|RB|TB|10|down|
80|Jaxson Dart|QB|NYG|8|up|rushing
81|Josh Jacobs|RB|GB|11|down|FADE
82|Wan'Dale Robinson|WR|TEN|9|down|half PPR fade
83|Jonathon Brooks|RB|CAR|5||
84|Justin Herbert|QB|LAC|7||
85|Michael Wilson|WR|ARI|14||
86|MarShawn Lloyd|RB|GB|11|up|Jacobs hedge
87|Caleb Williams|QB|CHI|10|up|rushing
88|Rico Dowdle|RB|PIT|9||
89|Stefon Diggs|WR|WAS|7||
90|Alec Pierce|WR|IND|13|up|
91|Tucker Kraft|TE|GB|11||
92|Chuba Hubbard|RB|CAR|5|down|tackles out
93|Jakobi Meyers|WR|JAC|7|down|
94|Trevor Lawrence|QB|JAC|7||
95|Aaron Jones Sr.|RB|MIN|6||
96|Brian Thomas Jr.|WR|JAC|7||
97|Brandon Aubrey|K|DAL|14|up|big leg
98|Brock Purdy|QB|SF|8||
99|Rachaad White|RB|WAS|7|down|
100|J.K. Dobbins|RB|DEN|10||
101|Kyle Monangai|RB|CHI|10||
102|Travis Kelce|TE|KC|5||
103|Matthew Golden|WR|GB|11||
104|Chris Godwin Jr.|WR|TB|10||
105|Jordan Addison|WR|MIN|6||
106|Josh Downs|WR|IND|13|down|half PPR fade
107|Dallas Goedert|TE|PHI|10||
108|RJ Harvey|RB|DEN|10|up|
109|Patrick Mahomes|QB|KC|5|hurt|ACL return
110|Khalil Shakir|WR|BUF|7|down|half PPR fade
111|Blake Corum|RB|LAR|11|up|
112|Bo Nix|QB|DEN|10|up|
113|Matthew Stafford|QB|LAR|11||
114|Jake Ferguson|TE|DAL|14||
115|Makai Lemon|WR|PHI|10||
116|Isaiah Likely|TE|NYG|8||
117|Quentin Johnston|WR|LAC|7||
118|Jacory Croskey-Merritt|RB|WAS|7||
119|Jayden Reed|WR|GB|11||
120|Mark Andrews|TE|BAL|13||
121|De'Zhaun Stribling|WR|SF|8||
122|Kyler Murray|QB|MIN|6|up|rushing
123|Xavier Worthy|WR|KC|5||
124|Romeo Doubs|WR|NE|11||
125|Jalen Coker|WR|CAR|5|down|tackles out
126|Dalton Kincaid|TE|BUF|7||
127|Tyjae Spears|RB|TEN|9||
128|Cameron Dicker|K|LAC|7|up|
129|Tyler Shough|QB|NO|8||
130|Jordan Mason|RB|MIN|6||
131|Deebo Samuel Sr.|WR|SF|8||
132|Jared Goff|QB|DET|6||
133|Woody Marks|RB|HOU|8||
134|Jason Myers|K|SEA|11||
135|KC Concepcion|WR|CLE|11||
136|Jalen McMillan|WR|TB|10||
137|Tank Dell|WR|HOU|8|hurt|IR stash
138|Texans D/ST|DST|HOU|8|up|best defense
139|Zach Charbonnet|RB|SEA|11|hurt|IR stash
140|Broncos D/ST|DST|DEN|10|up|
141|Jonah Coleman|RB|DEN|10||
142|Baker Mayfield|QB|TB|10||
143|Ka'imi Fairbairn|K|HOU|8|up|dome
144|Isiah Pacheco|RB|DET|6||
145|Chris Rodriguez Jr.|RB|JAC|7||
146|Harrison Mevis|K|LAR|11||
147|Daniel Jones|QB|IND|13|hurt|Achilles
148|Juwan Johnson|TE|NO|8||
149|Alvin Kamara|RB|NO|8|hurt|MCL
150|Tyler Allgeier|RB|ARI|14|up|best handcuff
151|Mike Washington Jr.|RB|LV|13|up|Jeanty hedge
152|Dylan Sampson|RB|CLE|11||
153|Hunter Henry|TE|NE|11||
154|T.J. Hockenson|TE|MIN|6||
155|Keaton Mitchell|RB|LAC|7||
156|Keenan Allen|WR|IND|13||
157|Samaje Perine|RB|CIN|6||
158|Eddy Pineiro|K|SF|8||
159|Jordan Love|QB|GB|11||
160|Brian Robinson Jr.|RB|ATL|11||
161|Terrance Ferguson|TE|LAR|11||
162|Rashid Shaheed|WR|SEA|11||
164|Kenyon Sadiq|TE|NYJ|13||
165|Calvin Ridley|WR|TEN|9||
166|Adonai Mitchell|WR|NYJ|13||
167|Travis Hunter|WR|JAC|7||
170|Jordyn Tyson|WR|NO|8||
173|Braelon Allen|RB|NYJ|13|up|Hall hedge
174|Tank Bigsby|RB|PHI|10|up|Barkley hedge
176|Rashod Bateman|WR|BAL|13||
180|Ray Davis|RB|BUF|7|up|Cook hedge
181|Najee Harris|RB|NYG|8||
182|Steelers D/ST|DST|PIT|9||
183|Seahawks D/ST|DST|SEA|11||
184|Rams D/ST|DST|LAR|11||
185|Ravens D/ST|DST|BAL|13||
186|Eagles D/ST|DST|PHI|10||
187|Browns D/ST|DST|CLE|11||
188|Patriots D/ST|DST|NE|11||
189|Lions D/ST|DST|DET|6||
190|Chiefs D/ST|DST|KC|5||
192|Harrison Butker|K|KC|5||
193|Cam Little|K|JAC|7|up|
194|Jake Bates|K|DET|6||
195|Tyler Loop|K|BAL|13||
196|Cairo Santos|K|CHI|10||
197|Will Reichard|K|MIN|6||
199|Justice Hill|RB|BAL|13||
200|Kaelon Black|RB|SF|8||`;

export const PLAYERS = RAW.trim()
  .split("\n")
  .map((line) => {
    const a = line.split("|");
    return {
      rk: +a[0],
      name: a[1],
      pos: a[2],
      team: a[3],
      bye: a[4],
      flag: a[5] || "",
      note: a[6] || "",
    };
  });

export const BY_NAME = PLAYERS.reduce((acc, p) => {
  acc[p.name] = p;
  return acc;
}, {});

// A name in a branch list that isn't on the 200 board still renders, it just
// can't be struck or claimed.
export const lookup = (name) =>
  BY_NAME[name] || { name, pos: "", team: "", bye: "", flag: "", note: "", missing: true };

// Starting lineup: QB, RB, RB, WR, WR, TE, FLEX, D/ST, K.
export const SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, K: 1 };

// Realistic targets across all 14 picks — a branch whose position is already
// at NEED is marked FILLED and collapsed.
export const NEED = { QB: 1, RB: 4, WR: 5, TE: 1, DST: 1, K: 1 };

export const TEAMS = 10;
export const SEAT = 2;
export const ROUNDS = 14;

// Snake order for seat 2 in a 10-team league.
export const PICKNUMS = Array.from({ length: ROUNDS }, (_, r) =>
  r % 2 === 0 ? r * TEAMS + SEAT : (r + 1) * TEAMS - SEAT + 1
);

export const BLOCKS = [
  {
    label: "Round 1",
    picks: "pick 2",
    idx: [0],
    branches: [
      {
        t: "Take the bell cow",
        why: "one flex, half PPR, 6-pt TDs",
        fill: null,
        list: ["Jahmyr Gibbs", "Bijan Robinson"],
      },
      {
        t: "If both backs are gone",
        why: "Greg went RB",
        fill: null,
        list: ["Ja'Marr Chase", "Jaxon Smith-Njigba"],
      },
    ],
  },
  {
    label: "Rounds 2 + 3",
    picks: "picks 19 and 22",
    idx: [1, 2],
    branches: [
      {
        t: "Path A — elite TE first",
        why: "20-pick cliff after Bowers",
        fill: "TE",
        list: ["Trey McBride", "Brock Bowers"],
      },
      {
        t: "then the receiver",
        why: "whoever of these is left at 22",
        fill: "WR",
        list: [
          "Nico Collins",
          "Chris Olave",
          "Rashee Rice",
          "George Pickens",
          "A.J. Brown",
          "Garrett Wilson",
          "Drake London",
        ],
      },
      {
        t: "Path B — RB2 instead",
        why: "if the WR run empties it",
        fill: "RB",
        list: [
          "Kenneth Walker III",
          "Quinshon Judkins",
          "Javonte Williams",
          "Kyren Williams",
          "Breece Hall",
        ],
      },
    ],
  },
  {
    label: "Rounds 4 + 5",
    picks: "picks 39 and 42",
    idx: [3, 4],
    branches: [
      {
        t: "TE if you still have none",
        why: "last real window",
        fill: "TE",
        list: ["Colston Loveland", "Tyler Warren", "Harold Fannin Jr.", "Kyle Pitts Sr."],
      },
      {
        t: "Running back",
        why: "you want 3 by round 6",
        fill: "RB",
        list: [
          "Quinshon Judkins",
          "Cam Skattebo",
          "D'Andre Swift",
          "Bhayshul Tuten",
          "Bucky Irving",
          "David Montgomery",
        ],
      },
      {
        t: "Receiver",
        why: "TD guys over slot guys here",
        fill: "WR",
        list: [
          "Tee Higgins",
          "Davante Adams",
          "Jaylen Waddle",
          "Terry McLaurin",
          "DJ Moore",
          "Rome Odunze",
        ],
      },
    ],
  },
  {
    label: "Rounds 6 + 7",
    picks: "picks 59 and 62",
    idx: [5, 6],
    branches: [
      {
        t: "QB — only if 2 of these 4 are already gone",
        why: "6-pt rush TDs, 4-pt pass TDs",
        fill: "QB",
        list: ["Jayden Daniels", "Drake Maye", "Jalen Hurts", "Jaxson Dart"],
      },
      {
        t: "Otherwise keep taking skill",
        why: "QB is nearly free until round 9",
        fill: null,
        list: [
          "Luther Burden III",
          "Carnell Tate",
          "Mike Evans",
          "Marvin Harrison Jr.",
          "DK Metcalf",
          "Courtland Sutton",
          "TreVeyon Henderson",
          "Rhamondre Stevenson",
          "Tony Pollard",
        ],
      },
      {
        t: "TE backstop if still empty",
        why: "do not go into round 9 TE-less",
        fill: "TE",
        list: ["Harold Fannin Jr.", "Kyle Pitts Sr.", "George Kittle", "Sam LaPorta", "Tucker Kraft"],
      },
    ],
  },
  {
    label: "Rounds 8 + 9",
    picks: "picks 79 and 82",
    idx: [7, 8],
    branches: [
      {
        t: "QB if you waited",
        why: "this is the last comfortable window",
        fill: "QB",
        list: ["Jaxson Dart", "Justin Herbert", "Caleb Williams", "Trevor Lawrence", "Brock Purdy"],
      },
      {
        t: "Skill",
        why: "fade Josh Jacobs at 81 — groin plus legal",
        fill: null,
        list: [
          "Jaylen Warren",
          "Jonathon Brooks",
          "MarShawn Lloyd",
          "Rico Dowdle",
          "Michael Wilson",
          "Stefon Diggs",
          "Alec Pierce",
        ],
      },
    ],
  },
  {
    label: "Rounds 10 + 11",
    picks: "picks 99 and 102",
    idx: [9, 10],
    branches: [
      {
        t: "RB upside",
        why: "real path to touches, not a pure backup",
        fill: "RB",
        list: ["RJ Harvey", "Blake Corum", "Jacory Croskey-Merritt", "Kyle Monangai", "J.K. Dobbins"],
      },
      {
        t: "WR upside",
        why: "",
        fill: "WR",
        list: ["Chris Godwin Jr.", "Jordan Addison", "Matthew Golden", "Xavier Worthy", "Jayden Reed"],
      },
      {
        t: "Emergency TE",
        why: "only if you somehow still have none",
        fill: "TE",
        list: ["Travis Kelce", "Dallas Goedert", "Isaiah Likely", "Terrance Ferguson"],
      },
    ],
  },
  {
    label: "Round 12",
    picks: "pick 119",
    idx: [11],
    branches: [
      {
        t: "Handcuff your own RB1",
        why: "only now, with 5 bench spots",
        fill: null,
        list: ["Tyler Allgeier", "Braelon Allen", "Tank Bigsby", "Ray Davis", "Mike Washington Jr."],
      },
      {
        t: "Or one more WR swing",
        why: "",
        fill: "WR",
        list: ["Makai Lemon", "De'Zhaun Stribling", "Jalen Coker", "Rashid Shaheed", "Jordyn Tyson"],
      },
    ],
  },
  {
    label: "Round 13 — defense",
    picks: "pick 122",
    idx: [12],
    branches: [
      {
        t: "Take a real one",
        why: "−10 for allowing 46+ makes a bad D a liability",
        fill: "DST",
        list: [
          "Texans D/ST",
          "Broncos D/ST",
          "Steelers D/ST",
          "Seahawks D/ST",
          "Rams D/ST",
          "Eagles D/ST",
          "Ravens D/ST",
          "Browns D/ST",
          "Patriots D/ST",
          "Lions D/ST",
        ],
      },
    ],
  },
  {
    label: "Round 14 — kicker",
    picks: "pick 139",
    idx: [13],
    branches: [
      {
        t: "Biggest leg left",
        why: "5 points for a 50-yarder in this league",
        fill: "K",
        list: [
          "Brandon Aubrey",
          "Ka'imi Fairbairn",
          "Cameron Dicker",
          "Cam Little",
          "Jason Myers",
          "Tyler Loop",
          "Jake Bates",
          "Harrison Butker",
          "Cairo Santos",
          "Will Reichard",
        ],
      },
    ],
  },
];

export const NEWS_CARDS = [
  {
    kind: "warn",
    head: "Jeremiyah Love — RB, ARI, ranked 19",
    body: "High ankle sprain in the preseason opener, and ESPN still has him as a second-round pick. Let somebody else find out. Tyler Allgeier is the beneficiary and is free in round 12.",
  },
  {
    kind: "warn",
    head: "Josh Jacobs — RB, GB, ranked 81",
    body: "Groin plus an unresolved off-field case open since May. Both sheets are stale. MarShawn Lloyd is the contingency five picks later.",
  },
  {
    kind: "good",
    head: "Nico Collins — WR, HOU, ranked 23",
    body: "Jayden Higgins tore his ACL and is out for the year. Collins was already the alpha; the target share concentrates further.",
  },
  {
    kind: "good",
    head: "Travis Etienne Jr. — RB, NO, ranked 35",
    body: "Kamara has an MCL sprain and was not placed on IR, so his workload rebuilds slowly. Etienne is the immediate play.",
  },
];

export const NEWS_NOTES = [
  ["Ashton Jeanty — RB, LV, 17", "Ankle sprain, coach optimistic for Week 1. Playable at cost, but pair him with a healthy September back."],
  ["Puka Nacua — WR, LAR, 4", "Groin soreness, missed practice, expected ready. Not a reason to pass at your pick."],
  ["Emeka Egbuka — WR, TB, 38", "Toe. Week 1 status still open as of this week."],
  ["Zay Flowers — WR, BAL, 37", "Quad contusion, called day to day. No Week 1 designation yet."],
  ["Malik Nabers — WR, NYG, 33", "ACL and meniscus return with a complicated rehab."],
  ["Breece Hall — RB, NYJ, 30", "On the monitor list. Fine if he practiced fully this week."],
  ["Patrick Mahomes — QB, KC, 109", "Torn ACL return, tracking to start. Have a plan B if he's your QB."],
  ["George Kittle — TE, SF, 72", "Achilles, activated off PUP Aug 23. Roster a second playable TE behind him."],
  ["Sam LaPorta — TE, DET, 78", "Aug 19 hip, back practicing. Likely just a contusion."],
  ["Rashee Rice — WR, KC, 25", "Health boxes checked, no suspension pending, ADP near WR12."],
  ["Luther Burden III · George Pickens", "Both cleared their camp injuries."],
  ["Carolina skill players", "Both starting tackles unavailable. Trim McMillan, Hubbard, Coker a notch."],
  ["Tank Dell · Zach Charbonnet", "IR-slot stashes only. Check the undroppable list first."],
];

export const RULE_CARDS = [
  {
    head: "Your cheat sheets are full PPR. Your league is half.",
    body: "Every catch is worth 0.5, not 1.0. On a 90-catch season that's a 45-point swing the sheets don't account for. Volume slot receivers drop; touchdown scorers and pure runners rise.",
  },
  {
    head: "The superflex sheet is dead weight tonight.",
    body: "You start one quarterback. That PDF prices QBs for a format you're not playing.",
  },
  {
    head: "Five bench spots, not seven.",
    body: "ESPN's sheet assumes seven. Nine starters plus five swings means no speculative handcuffing in the middle rounds.",
  },
];

export const RULE_NOTES = [
  ["Starting lineup", "QB, RB, RB, WR, WR, TE, FLEX, D/ST, K. Five bench, two IR."],
  ["Scoring quirks", "0.5 per catch · 6 per rush/rec TD · 4 per pass TD · 1 per 25 pass yards · −2 per INT · −2 per fumble lost. Rushing QBs are worth more than the sheets imply."],
  ["Kicker scoring is inflated", "3 / 4 / 5 / 5 for 0–39, 40–49, 50–59, 60+. Take the biggest leg left, not the most accurate."],
  ["Defense cuts both ways", "−2, −5, −10 for 28+, 35+, 46+ allowed, plus yardage penalties to −7. A bad defense loses you games."],
  ["Waivers, not FAAB", "Two-day period, move to last after a claim. First claim goes on a starter, not a lottery ticket."],
  ["Undroppable list is on", "A name-brand injured player can clog a roster spot you can't clear."],
  ["Lineups lock individually", "You can react to Sunday inactives all day."],
];

// Teams on bye each week, for the roster bye-conflict check.
export const BIG_BYES = {
  11: "six teams: Falcons, Browns, Packers, Rams, Patriots, Seahawks",
  6: "four teams",
  7: "four teams",
  8: "four teams",
  10: "four teams",
};

export const DRAFT_ORDER = [
  "Greg",
  "you",
  "Brian",
  "Chris F",
  "Justin",
  "Jason",
  "Kirk",
  "Peter",
  "Chris Stingone",
  "Alex",
];
