/* Solra Trainer — UI.
 *
 * Views are plain functions that return a DOM node. There is no framework and
 * no build step: the language modules are the interesting part of this app,
 * and they stay importable and testable on their own.
 */

import {
  WORDS, FAMILIES, CLASSES, SYLLABLES, NOTE_NAMES, FREQ,
  REGISTERS, URGENCIES, CODAS, BY_GLOSS, CHECK,
} from './lexicon.js';
import {
  fromText, toRoman, validate, describe, EXAMPLES, MAX_WORDS,
} from './utterance.js';
import { renderUtterance, renderPreamble, frameTiming } from './synth.js';
import * as audio from './audio.js';
import { decode } from './decode.js';
import * as progress from './progress.js';
import * as drills from './drills.js';

/* ── DOM helpers ──────────────────────────────────────────────────────── */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(message) {
  const box = $('#toasts');
  const node = el('div', { class: 'toast', text: message });
  box.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function sheet(title, body, actions = []) {
  const root = $('#sheet-root');
  const close = () => { root.innerHTML = ''; };
  const bg = el('div', {
    class: 'sheet-bg',
    onclick: (e) => { if (e.target === bg) close(); },
  }, [
    el('div', { class: 'sheet' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: title }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, [
          icon('M6 6l12 12M18 6L6 18'),
        ]),
      ]),
      body,
      actions.length ? el('div', { class: 'row', style: 'margin-top:18px;justify-content:flex-end' }, actions) : null,
    ]),
  ]);
  root.appendChild(bg);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  return close;
}

function icon(path, extra = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${path}"/>${extra}`;
  return svg;
}

const ICON_PLAY = 'M8 5.5v13l11-6.5-11-6.5Z';
const ICON_MIC = 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3ZM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3';

function playIcon() { return icon(ICON_PLAY); }

/* ── Slot strips: the four tones of a word, lit in time with playback ──── */

function slotStrip(utterance, opts = {}) {
  const wrap = el('div', { class: 'strip' });
  if (opts.preamble !== false) {
    wrap.appendChild(el('div', { class: 'strip-word strip-pre' }, [
      el('div', { class: 'strip-slots' }, [0, 4].map((tone, i) => el('div', {
        class: `slot t-${tone}`, dataset: { pre: String(i) }, text: SYLLABLES[tone],
      }))),
      el('div', { class: 'strip-label', text: 'chirp' }),
    ]));
  }
  utterance.words.forEach((gloss, wi) => {
    const w = BY_GLOSS.get(gloss);
    if (!w) return;
    const slots = el('div', { class: 'strip-slots' }, w.slots.map((tone, si) => el('div', {
      class: `slot t-${tone}${si === 3 ? ' check' : ''}${opts.blanks && opts.blanks.has(`${wi}:${si}`) ? ' blank' : ''}`,
      dataset: { w: String(wi), s: String(si) },
      text: opts.blanks && opts.blanks.has(`${wi}:${si}`) ? '?' : SYLLABLES[tone],
    })));
    const word = el('div', { class: 'strip-word' }, [slots]);
    if (opts.labels !== false) word.appendChild(el('div', { class: 'strip-label', text: gloss }));
    if (opts.slotNames) {
      word.appendChild(el('div', { class: 'slot-legend' },
        ['CLASS', 'FAM', 'MEM', 'CHECK'].map((n) => el('span', { text: n }))));
    }
    wrap.appendChild(word);
  });
  return wrap;
}

function highlighter(root) {
  if (!root) return () => {};
  return (mark) => {
    $$('.slot.lit', root).forEach((n) => n.classList.remove('lit'));
    if (!mark) return;
    let sel = null;
    if (mark.type === 'preamble') sel = `[data-pre="${mark.slot === 0 ? 0 : 1}"]`;
    else if (mark.type === 'slot') sel = `[data-w="${mark.word}"][data-s="${mark.slot}"]`;
    if (!sel) return;
    const node = $(sel, root);
    if (node) node.classList.add('lit');
  };
}

/* Wires a play button to a render function, keeping the button state honest
 * when playback is interrupted by another button. */
function playButton(getRendered, { big = false, label = 'Play', strip = null } = {}) {
  const btn = big
    ? el('button', { class: 'play-big', 'aria-label': label }, [playIcon()])
    : el('button', { class: 'btn btn-sm' }, [playIcon(), label]);
  btn.addEventListener('click', async () => {
    const rendered = getRendered();
    if (!rendered) return;
    btn.classList.add('playing');
    try {
      const root = strip ? strip() : null;
      await audio.play(rendered, {
        gain: progress.settings().volume,
        onMark: root ? highlighter(root) : undefined,
      });
    } catch (e) {
      toast('This browser blocked audio. Tap once more.');
    }
    btn.classList.remove('playing');
  });
  return btn;
}

/* ── Chrome ───────────────────────────────────────────────────────────── */

const VIEWS = [
  { id: 'learn', label: 'Learn' },
  { id: 'drill', label: 'Drill' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'compose', label: 'Compose' },
  { id: 'decode', label: 'Decode' },
];

let currentView = 'learn';

function go(view) {
  currentView = view;
  audio.stop();
  releaseDrillKeys();
  location.hash = view;
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  const main = $('#main');
  main.innerHTML = '';
  main.appendChild(renderView(view));
  main.scrollIntoView({ block: 'start' });
  window.scrollTo(0, 0);
}

function renderView(view) {
  switch (view) {
    case 'drill': return drillView();
    case 'dictionary': return dictionaryView();
    case 'compose': return composeView();
    case 'decode': return decodeView();
    default: return learnView();
  }
}

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  for (const v of VIEWS) {
    nav.appendChild(el('button', {
      text: v.label, dataset: { view: v.id },
      class: v.id === currentView ? 'on' : '',
      onclick: () => go(v.id),
    }));
  }
}

/* ── Learn ────────────────────────────────────────────────────────────── */

function statRow() {
  const c = progress.counts();
  const s = progress.todayStats();
  return el('div', { class: 'stat-row' }, [
    el('div', { class: 'stat' }, [
      el('b', { text: String(c.due) }),
      el('span', { text: c.due === 1 ? 'due now' : 'due now' }),
    ]),
    el('div', { class: 'stat' }, [
      el('b', { text: String(progress.unlockedWords().length) }),
      el('span', { text: 'words in deck' }),
    ]),
    el('div', { class: 'stat' }, [
      el('b', { text: String(progress.streak()) }),
      el('span', { text: 'day streak' }),
    ]),
    el('div', { class: 'stat' }, [
      el('b', { text: s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : '—' }),
      el('span', { text: `today · ${s.answered} answered` }),
    ]),
  ]);
}

function lesson(num, title, subtitle, bodyFn) {
  const box = el('div', { class: 'lesson' });
  const body = el('div', { class: 'lesson-body', hidden: true });
  let built = false;
  const head = el('button', {
    class: 'lesson-head',
    onclick: () => {
      const open = body.hidden;
      if (open && !built) { body.appendChild(bodyFn()); built = true; }
      body.hidden = !open;
      box.classList.toggle('open', open);
      if (!open) audio.stop();
    },
  }, [
    el('span', { class: 'lesson-num', text: num }),
    el('span', { class: 'fam-main' }, [
      el('div', { class: 'lesson-title', text: title }),
      el('div', { class: 'lesson-sub', text: subtitle }),
    ]),
    icon('M9 6l6 6-6 6', ''),
  ]);
  head.lastChild.classList.add('chev');
  box.append(head, body);
  return box;
}

function toneLessonBody() {
  const wrap = el('div');
  wrap.appendChild(el('p', {
    class: 'small muted',
    text: 'Eight phonemes drawn from the A minor pentatonic scale across an octave and a half. Nothing here is a vowel or a consonant; every one is a pure tone. No two form a dissonant interval, which is why a run of them sounds intentional rather than like an error tone.',
  }));
  wrap.appendChild(el('div', { class: 'row', style: 'margin-bottom:14px' }, [
    playButton(() => renderPreamble(), { label: 'Play the chirp (do–so)' }),
    el('span', { class: 'tiny muted', text: 'Two notes, 200 ms. It says a droid is about to speak, and it is the pitch reference the rest of the utterance is measured against.' }),
  ]));
  wrap.appendChild(el('div', { class: 'tone-grid' }, SYLLABLES.map((syl, i) => {
    const chip = el('button', { class: `tone-chip t-${i}` }, [
      el('span', { class: 'tone-dot' }),
      el('span', { class: 'syl', text: syl }),
      el('span', { class: 'meta', html: `T${i}<br>${NOTE_NAMES[i]} · ${FREQ[i].toFixed(0)} Hz` }),
    ]);
    chip.addEventListener('click', async () => {
      chip.classList.add('playing');
      await audio.playTone(FREQ[i], 600, { gain: progress.settings().volume });
      chip.classList.remove('playing');
    });
    return chip;
  })));
  wrap.appendChild(el('p', {
    class: 'tiny muted', style: 'margin-top:14px',
    text: 'Adjacent tones sit at least three semitones apart — far wider than a decoder needs, and wide enough that an untrained ear can tell neighbours apart.',
  }));
  return wrap;
}

function prosodyLessonBody() {
  const wrap = el('div');
  wrap.appendChild(el('p', {
    class: 'small muted',
    text: 'Six distinctions in total, and they carry most of the comprehension. Someone who knows no vocabulary at all can already tell an alarm from a joke. Learn these before a single word.',
  }));

  const demo = ['DROID', 'READY'];
  const mk = (label, u, note) => el('div', { class: 'fam' }, [
    playButton(() => renderUtterance(u), { label: 'Play' }),
    el('span', { class: 'fam-main' }, [
      el('div', { class: 'fam-name', text: label }),
      el('div', { class: 'fam-words', text: note }),
    ]),
  ]);

  wrap.appendChild(el('h3', { text: 'Register — valence', style: 'margin:16px 0 8px' }));
  wrap.appendChild(el('div', { class: 'fam-list' }, REGISTERS.map((r) => mk(
    `${r.name}  ${r.mark || '(unmarked)'}`,
    { words: demo, register: r.value, urgency: 0, coda: 'fall' },
    `${r.meaning}. The whole utterance, chirp included, shifts by one pentatonic step.`,
  ))));

  wrap.appendChild(el('h3', { text: 'Urgency — tempo', style: 'margin:18px 0 8px' }));
  wrap.appendChild(el('div', { class: 'fam-list' }, URGENCIES.map((u) => mk(
    `${u.name}  ${u.mark || '(unmarked)'}`,
    { words: demo, register: 0, urgency: u.value, coda: 'fall' },
    `${u.slotMs} ms slots, ${u.gapMs} ms gaps. ${u.meaning}.`,
  ))));

  wrap.appendChild(el('h3', { text: 'Coda — illocution', style: 'margin:18px 0 8px' }));
  wrap.appendChild(el('div', { class: 'fam-list' }, CODAS.map((c) => mk(
    `${c.name}  ${c.mark}`,
    { words: demo, register: 0, urgency: 0, coda: c.value },
    `${c.meaning}. A 120 ms glide appended after the last word, never a bend on a content slot.`,
  ))));

  wrap.appendChild(el('p', {
    class: 'tiny muted', style: 'margin-top:16px',
    text: 'Rising for questions and higher pitch for positive arousal are close to human cross-linguistic universals, so half of this reads correctly on first exposure.',
  }));
  return wrap;
}

function classLessonBody() {
  const wrap = el('div');
  wrap.appendChild(el('p', {
    class: 'small muted',
    text: 'The first tone of every word names its semantic class, so you know what kind of thing is coming before the word finishes. Eight sounds that cut the search space by eight on every word for the rest of your life. This is the single biggest aid to learning the language, which is why it is worth a whole slot.',
  }));
  const table = el('table', { class: 'tbl' }, [
    el('thead', {}, [el('tr', {}, ['', 'Tone', 'Class', 'Contents'].map((h) => el('th', { text: h })))]),
    el('tbody', {}, CLASSES.map((c) => el('tr', {}, [
      el('td', {}, [playButton(() => renderUtterance(
        { words: [WORDS.find((w) => w.cls === c.id).gloss], register: 0, urgency: 0, coda: null },
        { preamble: true, coda: false },
      ), { label: '' })]),
      el('td', {}, [el('span', { class: `class-syl t-${c.id}`, text: SYLLABLES[c.id] })]),
      el('td', {}, [el('strong', { text: c.name })]),
      el('td', { class: 'small muted', text: c.gloss }),
    ]))),
  ]);
  wrap.appendChild(el('div', { class: 'tbl-scroll' }, [table]));
  return wrap;
}

function wordShapeLessonBody() {
  const wrap = el('div');
  wrap.appendChild(el('p', {
    class: 'small muted',
    text: 'Every word is exactly four slots: CLASS, FAMILY, MEMBER, then a CHECK slot computed from the other three. The check is what makes the language safe to speak in a noisy room — any single mis-heard slot produces an invalid word rather than a different valid one, so a decoder says AGAIN instead of confidently saying the wrong thing.',
  }));

  const state = { cls: 3, fam: 1, mem: 0 };
  const out = el('div', { style: 'margin-top:14px' });

  const refresh = () => {
    out.innerHTML = '';
    const check = CHECK(state.cls, state.fam, state.mem);
    const fam = FAMILIES.find((f) => f.cls === state.cls && f.fam === state.fam);
    const word = fam ? fam.words[state.mem] : null;
    if (!word) {
      out.appendChild(el('div', { class: 'note-box warn', text: 'That address is inside the reserved space — 512 addresses exist, 192 are assigned in v0.1.' }));
      return;
    }
    const u = { words: [word.gloss], register: 0, urgency: 0, coda: null };
    const strip = slotStrip(u, { preamble: false, labels: false, slotNames: true });
    out.append(
      el('div', { class: 'row', style: 'margin-bottom:12px' }, [
        playButton(() => renderUtterance(u, { preamble: true, coda: false }), { label: 'Hear it', strip: () => strip }),
        el('strong', { text: word.gloss, style: 'font-size:17px' }),
        el('span', { class: 'dict-roman', text: word.roman }),
        el('span', { class: 'dict-addr', text: word.address }),
      ]),
      strip,
      el('div', { class: 'note-box ok', style: 'margin-top:14px' }, [
        el('div', { html: `CHECK = (8 − ((${state.cls} + ${state.fam} + ${state.mem}) mod 8)) mod 8 = <strong>${check}</strong> — the tone <strong>${SYLLABLES[check]}</strong>.` }),
        el('div', { class: 'tiny', style: 'margin-top:6px', text: 'Three slots would have capped the language at 64 words. A fourth slot buys 512 at the same error-detection guarantee, for 100 ms per word.' }),
      ]),
    );
  };

  const seg = (label, count, key, labels) => el('div', { class: 'row', style: 'margin-bottom:8px' }, [
    el('span', { class: 'tiny muted', style: 'width:62px', text: label }),
    el('div', { class: 'seg' }, Array.from({ length: count }, (_, i) => el('button', {
      text: labels ? labels[i] : SYLLABLES[i],
      class: state[key] === i ? 'on' : '',
      onclick: (e) => {
        state[key] = i;
        $$('button', e.target.parentNode).forEach((b, bi) => b.classList.toggle('on', bi === i));
        refresh();
      },
    }))),
  ]);

  wrap.append(
    seg('CLASS', 8, 'cls'),
    seg('FAMILY', 4, 'fam'),
    seg('MEMBER', 8, 'mem'),
    out,
  );
  refresh();
  return wrap;
}

function familyRow(fam, onChange) {
  const on = progress.isUnlocked(fam.key);
  const strength = progress.familyStrength(fam.key);
  const row = el('div', { class: `fam${on ? '' : ' locked'}` }, [
    el('span', { class: 'fam-main' }, [
      el('div', { class: 'fam-name' }, [
        fam.name,
        el('span', { class: 'dict-addr', style: 'margin-left:8px', text: `${fam.cls}${fam.fam}xx` }),
      ]),
      el('div', { class: 'fam-words', text: fam.words.map((w) => w.gloss).join(' · ') }),
      on ? el('div', { class: 'meter', style: 'margin-top:7px;max-width:160px' }, [
        el('i', { style: `width:${Math.round(strength * 100)}%` }),
      ]) : null,
    ]),
    playButton(() => {
      const u = { words: fam.words.map((w) => w.gloss).slice(0, 4), register: 0, urgency: 0, coda: 'level' };
      return renderUtterance(u);
    }, { label: '' }),
    on ? el('button', {
      class: 'btn btn-sm', text: 'Drill',
      onclick: () => {
        startSession(drills.focusPlan(fam.key, SESSION_LENGTH));
        go('drill');
      },
    }) : null,
    el('button', {
      class: `btn btn-sm${on ? '' : ' btn-primary'}`,
      text: on ? 'In deck' : 'Add',
      onclick: () => {
        if (on) progress.lock(fam.key); else progress.unlock(fam.key);
        toast(on ? `${fam.name} removed from your deck` : `${fam.name} added — 8 words`);
        onChange();
      },
    }),
  ]);
  return row;
}

function learnView() {
  const view = el('div', { class: 'view' });
  const counts = progress.counts();

  view.appendChild(el('div', { class: 'hero' }, [
    el('h1', { text: 'Learn to hear a droid.' }),
    el('p', { text: 'Solra has eight phonemes and all of them are pure tones. Start with the class prefixes and the prosody: six distinctions and eight sounds, and you can already tell an alarm from a joke without knowing a single word.' }),
  ]));

  view.appendChild(statRow());

  view.appendChild(el('div', { class: 'row', style: 'margin-bottom:26px' }, [
    el('button', {
      class: 'btn btn-primary btn-lg',
      text: counts.due ? `Practise ${counts.due} due` : 'Start a session',
      onclick: () => go('drill'),
    }),
    el('span', { class: 'tiny muted', text: `${counts.learned} of ${counts.active} items are sticking.` }),
  ]));

  view.appendChild(el('h2', { text: 'Foundations', style: 'margin-bottom:10px' }));
  view.appendChild(el('p', {
    class: 'small muted', style: 'margin-bottom:14px',
    text: 'These four are always in your deck. They are worth more than any amount of vocabulary.',
  }));
  view.append(
    lesson('1', 'The chirp and the eight tones', 'Eight phonemes from the A minor pentatonic scale', toneLessonBody),
    lesson('2', 'Prosody is grammar', 'Register, urgency and coda — six distinctions, most of the meaning', prosodyLessonBody),
    lesson('3', 'The eight class prefixes', 'The first tone tells you what kind of word is coming', classLessonBody),
    lesson('4', 'The shape of a word', 'CLASS · FAMILY · MEMBER · CHECK, and why the fourth slot exists', wordShapeLessonBody),
  );

  view.appendChild(el('h2', { text: 'Vocabulary', style: 'margin:28px 0 10px' }));
  view.appendChild(el('p', {
    class: 'small muted', style: 'margin-bottom:6px',
    text: 'Add a family to your deck and it starts appearing in drills. Words inside a family differ by a single slot, which makes them maximally confusable and therefore the right unit to practise — so families are added whole.',
  }));

  const rerender = () => go('learn');
  for (const c of CLASSES) {
    view.appendChild(el('div', { class: 'class-head' }, [
      el('span', { class: `class-syl t-${c.id}`, text: SYLLABLES[c.id] }),
      el('h3', { text: c.name }),
      el('span', { class: 'tiny muted', text: c.gloss }),
    ]));
    view.appendChild(el('div', { class: 'fam-list' },
      FAMILIES.filter((f) => f.cls === c.id).map((f) => familyRow(f, rerender))));
  }
  return view;
}

/* ── Drill ────────────────────────────────────────────────────────────── */

const SESSION_LENGTH = 15;
let session = null;

/* One live keyboard handler at a time. Attaching a fresh listener per card and
 * never dropping the old ones meant Enter fired every stale handler at once
 * and skipped several questions. */
let drillKeys = null;

function releaseDrillKeys() {
  if (!drillKeys) return;
  document.removeEventListener('keydown', drillKeys);
  drillKeys = null;
}

function startSession(queue = null) {
  session = {
    asked: 0, correct: 0, done: false, last: null,
    queue: queue || drills.sessionPlan(SESSION_LENGTH),
  };
}

function drillView() {
  const view = el('div', { class: 'view' });
  if (!session || session.done) startSession();
  const host = el('div');
  view.appendChild(host);
  nextCard(host, view);
  return view;
}

function sessionBar(onQuit) {
  const pct = Math.min(100, (session.asked / SESSION_LENGTH) * 100);
  return el('div', { class: 'session-bar' }, [
    el('span', { class: 'tiny muted mono', text: `${session.asked}/${SESSION_LENGTH}` }),
    el('div', { class: 'progress-track' }, [el('div', { class: 'progress-fill', style: `width:${pct}%` })]),
    el('span', {
      class: 'tiny muted',
      text: session.asked ? `${Math.round((session.correct / session.asked) * 100)}%` : '',
    }),
    el('button', { class: 'icon-btn', 'aria-label': 'End session', onclick: onQuit }, [icon('M6 6l12 12M18 6L6 18')]),
  ]);
}

function nextCard(host, view) {
  audio.stop();
  releaseDrillKeys();
  host.innerHTML = '';

  if (session.asked >= SESSION_LENGTH) return host.appendChild(summaryCard(host, view));

  const itemId = session.queue.shift();
  const q = (itemId ? drills.questionFor(itemId) : null) || drills.nextQuestion(session.last);
  if (!q) {
    return host.appendChild(el('div', { class: 'card empty' }, [
      el('h2', { text: 'Nothing in the deck yet' }),
      el('p', { class: 'muted', style: 'margin-top:10px' , text: 'Add a word family on the Learn tab and come back.' }),
      el('button', { class: 'btn btn-primary', text: 'Go to Learn', onclick: () => go('learn') }),
    ]));
  }

  host.appendChild(sessionBar(() => { session.done = true; go('learn'); }));

  const card = el('div', { class: 'q-card' });
  host.appendChild(card);

  card.append(
    el('span', { class: 'q-kind', text: KIND_LABELS[q.kind] || q.kind }),
    el('div', { class: 'q-title', text: q.title }),
    q.subtitle ? el('div', { class: 'q-sub', text: q.subtitle }) : el('div', { style: 'height:10px' }),
  );

  const zone = el('div', { class: 'play-zone' });
  if (q.render) {
    const big = playButton(q.render, { big: true, label: 'Play again' });
    zone.append(big, el('span', { class: 'tiny muted', text: 'Tap to hear it again' }));
    if (q.hint) {
      zone.appendChild(playButton(q.hint.render, { label: q.hint.label }));
    }
    card.appendChild(zone);
    if (progress.settings().autoplay) {
      setTimeout(() => big.click(), 180);
    }
  } else {
    card.appendChild(el('div', { class: 'play-zone' }, [
      el('div', { style: 'font-size:30px;font-weight:700;letter-spacing:.02em', text: q.answerLabel || '' }),
      el('span', { class: 'tiny muted', text: 'Answer first — the audio comes after.' }),
    ]));
  }

  const choices = el('div', { class: `choices ${q.layout}` });
  card.appendChild(choices);

  const buttons = q.choices.map((c) => el('button', {
    class: 'choice',
    onclick: () => answer(String(c.key)),
  }, [
    el('span', { class: `c-label${q.kind === 'recall' ? ' mono' : ''}` }, [
      c.tone != null ? el('span', { class: `tone-dot t-${c.tone}`, style: 'display:inline-block;margin-right:8px;vertical-align:baseline' }) : null,
      c.label,
    ]),
    c.sub ? el('span', { class: 'c-sub', text: c.sub }) : null,
  ]));
  buttons.forEach((b) => choices.appendChild(b));

  let answered = false;
  function answer(key) {
    if (answered) return;
    answered = true;
    const correct = key === String(q.answer);
    session.asked += 1;
    if (correct) session.correct += 1;
    session.last = q.itemId;
    progress.record(q.itemId, correct);
    // A missed item comes back before the session ends rather than waiting on
    // the schedule, which is where the correction actually sticks.
    if (!correct && session.queue.length > 1) {
      session.queue.splice(Math.min(3, session.queue.length), 0, q.itemId);
    }

    buttons.forEach((b, i) => {
      const ck = String(q.choices[i].key);
      b.disabled = true;
      if (ck === String(q.answer)) b.classList.add('right');
      else if (ck === key) b.classList.add('wrong');
      else b.classList.add('faded');
    });

    card.appendChild(el('div', { class: `verdict ${correct ? 'ok' : 'no'}` }, [
      icon(correct ? 'M5 13l4 4L19 7' : 'M6 6l12 12M18 6L6 18'),
      correct ? 'Right' : 'Not this time',
    ]));

    const reveal = el('div', { class: 'reveal' });
    if (q.reveal.title) reveal.appendChild(el('div', { class: 'reveal-title', text: q.reveal.title }));
    if (q.reveal.roman && progress.settings().showRomanization) {
      reveal.appendChild(el('div', { class: 'reveal-roman', text: q.reveal.roman }));
    }
    if (q.reveal.note) reveal.appendChild(el('div', { class: 'reveal-note', text: q.reveal.note }));

    const replay = q.render || q.revealAudio;
    if (replay) {
      reveal.appendChild(el('div', { class: 'row', style: 'margin-top:12px' }, [
        playButton(replay, { label: 'Hear it again' }),
      ]));
      if (!q.render && progress.settings().autoplay) {
        setTimeout(() => audio.play(q.revealAudio(), { gain: progress.settings().volume }), 200);
      }
    }
    card.appendChild(reveal);

    const next = el('button', {
      class: 'btn btn-primary btn-lg', style: 'margin-top:16px;width:100%;justify-content:center',
      text: session.asked >= SESSION_LENGTH ? 'See how you did' : 'Next',
      onclick: () => nextCard(host, view),
    });
    card.appendChild(next);
    next.focus();
  }

  drillKeys = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (answered) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextCard(host, view); }
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= buttons.length) { e.preventDefault(); buttons[n - 1].click(); }
    if (e.key === 'r' && q.render) {
      e.preventDefault();
      const big = $('.play-big', card);
      if (big) big.click();
    }
  };
  document.addEventListener('keydown', drillKeys);
}

const KIND_LABELS = {
  tone: 'Ear training', class: 'Class prefix', register: 'Prosody · register',
  urgency: 'Prosody · urgency', coda: 'Prosody · coda', minimalpair: 'Minimal pair',
  listen: 'Comprehension', recall: 'Production', cloze: 'Parity', sentence: 'Sentence',
};

function summaryCard(host, view) {
  const pct = session.asked ? Math.round((session.correct / session.asked) * 100) : 0;
  const counts = progress.counts();
  return el('div', { class: 'card center' }, [
    el('h1', { text: `${pct}%`, style: 'font-size:52px;margin-bottom:4px' }),
    el('p', { class: 'muted', text: `${session.correct} of ${session.asked} in this session. ${counts.due} item${counts.due === 1 ? '' : 's'} still due.` }),
    el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, [
      el('button', {
        class: 'btn btn-primary btn-lg',
        text: 'Another round',
        onclick: () => { startSession(); nextCard(host, view); },
      }),
      el('button', { class: 'btn btn-lg', text: 'Back to Learn', onclick: () => { session.done = true; go('learn'); } }),
    ]),
  ]);
}

/* ── Dictionary ───────────────────────────────────────────────────────── */

let dictQuery = '';
let dictClass = null;

function dictionaryView() {
  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'hero' }, [
    el('h1', { text: 'Lexicon v0.1' }),
    el('p', { text: '192 words assigned out of 512 addressable. The rest is reserved: addresses are never reused or reassigned, because a device flashed in 2027 has to still be understood in 2032. Search by word, by romanization, or by address.' }),
  ]));

  const input = el('input', {
    class: 'search', type: 'search', placeholder: 'WATER, mi-do-re-la, 2015…',
    value: dictQuery, autocomplete: 'off', spellcheck: 'false',
  });
  const list = el('div');
  const chips = el('div', { class: 'chips' });

  const paint = () => {
    const q = dictQuery.trim().toLowerCase().replace(/\s+/g, '');
    list.innerHTML = '';
    const matches = WORDS.filter((w) => {
      if (dictClass != null && w.cls !== dictClass) return false;
      if (!q) return true;
      return w.gloss.toLowerCase().includes(q)
        || w.roman.replace(/-/g, '').includes(q.replace(/-/g, ''))
        || w.address.includes(q)
        || w.familyName.toLowerCase().includes(q)
        || (w.hint && w.hint.toLowerCase().includes(q));
    });
    if (!matches.length) {
      list.appendChild(el('div', { class: 'empty', text: 'Nothing in the v0.1 lexicon matches that.' }));
      return;
    }
    list.appendChild(el('div', { class: 'tiny muted', style: 'margin:4px 0 10px', text: `${matches.length} word${matches.length === 1 ? '' : 's'}` }));
    for (const w of matches) list.appendChild(dictRow(w));
  };

  input.addEventListener('input', () => { dictQuery = input.value; paint(); });

  chips.appendChild(el('button', {
    class: `chip${dictClass == null ? ' on' : ''}`, text: 'All',
    onclick: () => { dictClass = null; go('dictionary'); },
  }));
  for (const c of CLASSES) {
    chips.appendChild(el('button', {
      class: `chip${dictClass === c.id ? ' on' : ''}`,
      text: `${SYLLABLES[c.id]} · ${c.name}`,
      onclick: () => { dictClass = c.id; go('dictionary'); },
    }));
  }

  view.append(input, chips, list);
  paint();
  return view;
}

function dictRow(w) {
  const u = { words: [w.gloss], register: 0, urgency: 0, coda: null };
  const strip = slotStrip(u, { preamble: false, labels: false });
  const inDeck = progress.isUnlocked(`${w.cls}.${w.fam}`);
  return el('div', { class: 'dict-row' }, [
    playButton(() => renderUtterance(u, { preamble: true, coda: false }), { label: '', strip: () => strip }),
    el('span', { class: 'fam-main' }, [
      el('div', { class: 'row-tight' }, [
        el('span', { class: 'dict-gloss', text: w.gloss }),
        el('span', { class: 'dict-roman', text: w.roman }),
        el('span', { class: 'dict-addr', text: w.address }),
        inDeck ? el('span', { class: 'pill on', text: 'in deck' }) : null,
      ]),
      el('div', { class: 'dict-meta', text: `${w.className} · ${w.familyName}${w.hint ? ` — ${w.hint}` : ''}` }),
    ]),
    strip,
  ]);
}

/* ── Compose ──────────────────────────────────────────────────────────── */

const draft = { words: ['DROID', 'READY'], register: 0, urgency: 0, coda: 'fall' };
let pickerClass = 0;
let pickerQuery = '';

function composeView() {
  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'hero' }, [
    el('h1', { text: 'Say something' }),
    el('p', { text: 'Build an utterance, set its prosody, and hear it. The validator below is the deterministic one from §8.3 of the spec: it is what stands between a language model guessing at glosses and audio that means the same thing on every device.' }),
  ]));

  const builder = el('div', { class: 'builder' });
  const strip = el('div');
  const status = el('div');
  const timing = el('div', { class: 'tiny muted', style: 'margin-top:10px' });

  const repaint = () => {
    const result = validate(draft);
    builder.innerHTML = '';
    if (!draft.words.length) {
      builder.appendChild(el('span', { class: 'muted small', text: 'Pick words below. Topic first, then comment.' }));
    }
    draft.words.forEach((g, i) => {
      const w = BY_GLOSS.get(g);
      const hasErr = result.errors.some((e) => e.index === i);
      const hasWarn = result.warnings.some((e) => e.index === i);
      builder.appendChild(el('span', { class: `tok${hasErr ? ' err' : hasWarn ? ' warn' : ''}` }, [
        el('span', {}, [g, el('br'), el('small', { text: w ? w.roman : '????' })]),
        el('button', {
          text: '×', 'aria-label': `Remove ${g}`,
          onclick: () => { draft.words.splice(i, 1); repaint(); },
        }),
      ]));
    });

    strip.innerHTML = '';
    if (draft.words.length) strip.appendChild(slotStrip(draft, { preamble: true }));

    status.innerHTML = '';
    if (result.errors.length) {
      status.appendChild(el('div', { class: 'note-box err' }, [
        el('strong', { text: 'The validator rejects this.' }),
        el('ul', {}, result.errors.map((e) => el('li', { text: e.message }))),
      ]));
    } else {
      status.appendChild(el('div', { class: 'note-box ok' }, [
        el('div', {}, [el('strong', { text: 'Valid. ' }), toRoman(draft)]),
        el('div', { class: 'tiny', style: 'margin-top:5px', text: describe(draft) }),
      ]));
    }
    for (const w of result.warnings) {
      status.appendChild(el('div', { class: 'note-box warn', text: w.message }));
    }

    const t = frameTiming(draft.urgency);
    const ms = draft.words.length ? t.utteranceMs(draft.words.length) : 0;
    timing.textContent = draft.words.length
      ? `${(ms / 1000).toFixed(2)} s — ${t.preambleMs} ms preamble, ${draft.words.length} × ${t.wordMs} ms word${draft.words.length > 1 ? `, ${draft.words.length - 1} × ${t.wordGapMs} ms between` : ''}, ${t.codaMs} ms coda.`
      : '';
  };

  const seg = (label, options, key) => {
    const box = el('div', { class: 'seg' });
    options.forEach((o) => box.appendChild(el('button', {
      text: o.label, title: o.title || '',
      class: draft[key] === o.value ? 'on' : '',
      onclick: () => {
        draft[key] = o.value;
        $$('button', box).forEach((b, i) => b.classList.toggle('on', options[i].value === o.value));
        repaint();
      },
    })));
    return el('div', { class: 'row' }, [el('span', { class: 'tiny muted', style: 'width:66px', text: label }), box]);
  };

  const controls = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', { text: 'Prosody' })]),
    seg('Register', REGISTERS.map((r) => ({ value: r.value, label: r.name, title: r.meaning })), 'register'),
    el('div', { style: 'height:8px' }),
    seg('Urgency', URGENCIES.map((u) => ({ value: u.value, label: u.name.split(' ')[0], title: u.meaning })), 'urgency'),
    el('div', { style: 'height:8px' }),
    seg('Coda', CODAS.map((c) => ({ value: c.value, label: `${c.name} ${c.mark}`, title: c.meaning })), 'coda'),
  ]);

  const picker = el('div', { class: 'picker' });
  const paintPicker = () => {
    picker.innerHTML = '';
    const q = pickerQuery.trim().toLowerCase();
    const pool = WORDS.filter((w) => (q ? w.gloss.toLowerCase().includes(q) : w.cls === pickerClass));
    for (const w of pool) {
      picker.appendChild(el('button', {
        text: w.gloss, title: `${w.roman} · ${w.address}`,
        onclick: () => {
          if (draft.words.length >= MAX_WORDS) { toast('Eight words is the hard cap.'); return; }
          draft.words.push(w.gloss);
          repaint();
        },
      }));
    }
    if (!pool.length) picker.appendChild(el('span', { class: 'small muted', style: 'padding:8px', text: 'No match.' }));
  };

  const search = el('input', {
    class: 'search', type: 'search', placeholder: 'Filter words…', autocomplete: 'off',
  });
  search.addEventListener('input', () => { pickerQuery = search.value; paintPicker(); });

  const classChips = el('div', { class: 'chips' }, CLASSES.map((c) => el('button', {
    class: `chip${pickerClass === c.id ? ' on' : ''}`,
    text: `${SYLLABLES[c.id]} · ${c.name}`,
    onclick: (e) => {
      pickerClass = c.id;
      pickerQuery = '';
      search.value = '';
      $$('button', classChips).forEach((b, i) => b.classList.toggle('on', CLASSES[i].id === c.id));
      paintPicker();
    },
  })));

  view.append(
    builder,
    el('div', { class: 'row', style: 'margin:14px 0' }, [
      playButton(() => renderUtterance(draft), { big: false, label: 'Play', strip: () => strip }),
      el('button', {
        class: 'btn btn-sm', text: 'Copy notation',
        onclick: () => {
          navigator.clipboard.writeText(toRoman(draft)).then(
            () => toast('Copied ' + toRoman(draft)),
            () => toast('Clipboard blocked'),
          );
        },
      }),
      el('button', { class: 'btn btn-sm', text: 'Clear', onclick: () => { draft.words = []; repaint(); } }),
      el('button', {
        class: 'btn btn-sm', text: 'Load an example',
        onclick: () => exampleSheet((text) => {
          const u = fromText(text);
          if (!u) return;
          Object.assign(draft, u);
          go('compose');
        }),
      }),
    ]),
    strip,
    timing,
    status,
    controls,
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: 'Words' })]),
      search,
      classChips,
      picker,
    ]),
  );

  repaint();
  paintPicker();
  return view;
}

function exampleSheet(onPick) {
  const list = el('div', { class: 'fam-list' }, EXAMPLES.map((ex) => {
    const u = fromText(ex.text);
    return el('div', { class: 'fam' }, [
      playButton(() => renderUtterance(u), { label: '' }),
      el('span', { class: 'fam-main' }, [
        el('div', { class: 'fam-name', text: u.words.join(' ') }),
        el('div', { class: 'fam-words mono', text: toRoman(u) }),
        ex.english ? el('div', { class: 'fam-words', text: ex.english }) : null,
      ]),
      el('button', { class: 'btn btn-sm', text: 'Load', onclick: () => { close(); onPick(ex.text); } }),
    ]);
  }));
  const close = sheet('Worked examples', list);
}

/* ── Decode ───────────────────────────────────────────────────────────── */

function decodeView() {
  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'hero' }, [
    el('h1', { text: 'Decode what you hear' }),
    el('p', { text: 'Eight Goertzel filters per 80 ms window, argmax bin, rejected as noise unless the winner clears the mean of the other seven. Register and tempo are recovered by trying all nine combinations and keeping whichever produces a whole number of words with valid parity.' }),
  ]));

  const out = el('div');
  const ring = el('div', { class: 'level-ring' }, [icon(ICON_MIC)]);

  const show = (result, sourceNote) => {
    out.innerHTML = '';
    if (!result) {
      out.appendChild(el('div', { class: 'note-box err', text: 'Nothing above the noise floor. Move closer to the speaker, turn it up, and try again.' }));
      return;
    }
    const reg = REGISTERS.find((r) => r.value === result.register);
    const urg = URGENCIES.find((u) => u.value === result.urgency);
    const coda = CODAS.find((c) => c.value === result.coda);

    out.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: result.clean ? 'Decoded' : 'Decoded with errors' }),
        el('span', { class: 'spacer' }),
        el('span', { class: `pill${result.clean ? ' on' : ''}`, text: `${Math.round(result.parity * 100)}% parity` }),
      ]),
      el('div', { style: 'font-size:22px;font-weight:700;letter-spacing:.01em;margin-bottom:4px', text: result.text }),
      el('div', { class: 'dict-roman', style: 'margin-bottom:12px', text: result.words.map((w) => w.roman).join(' ') }),
      el('div', { class: 'row-tight', style: 'margin-bottom:14px' }, [
        el('span', { class: 'pill', text: `Register ${reg ? reg.name : '?'}` }),
        el('span', { class: 'pill', text: urg ? urg.name : '?' }),
        el('span', { class: 'pill', text: `Coda ${coda ? coda.name : '?'}` }),
        el('span', { class: `pill${result.preambleOk ? ' on' : ''}`, text: result.preambleOk ? 'chirp found' : 'no chirp' }),
      ]),
      ...result.words.map((w, i) => el('div', { class: `decode-word${w.valid && w.gloss ? '' : ' bad'}` }, [
        el('div', { class: 'row-tight' }, [
          el('strong', { text: w.valid && w.gloss ? w.gloss : 'AGAIN' }),
          el('span', { class: 'dict-roman', text: w.roman }),
          el('span', { class: 'dict-addr', text: w.address }),
          el('span', { class: 'spacer' }),
          el('span', { class: 'tiny dim mono', text: `snr ${w.minRatio > 90 ? '∞' : w.minRatio.toFixed(1)}` }),
        ]),
        !w.valid ? el('div', { class: 'tiny muted', style: 'margin-top:4px', text: `Parity fails: ${w.slots[0]} + ${w.slots[1]} + ${w.slots[2]} needs a check of ${CHECK(w.slots[0], w.slots[1], w.slots[2])}, not ${w.slots[3]}. A decoder says AGAIN here rather than guess.` }) : null,
        w.valid && w.unassigned ? el('div', { class: 'tiny muted', style: 'margin-top:4px', text: 'Valid address, but unassigned in v0.1. That is reserved registry space.' }) : null,
      ])),
      sourceNote ? el('div', { class: 'tiny muted', style: 'margin-top:10px', text: sourceNote }) : null,
    ]));
  };

  const listenBtn = el('button', {
    class: 'btn btn-primary btn-lg', text: 'Listen',
    onclick: async () => {
      if (!audio.micSupported()) { toast('This browser has no microphone access.'); return; }
      listenBtn.disabled = true;
      listenBtn.textContent = 'Listening…';
      ring.classList.add('live');
      out.innerHTML = '';
      try {
        const rec = await audio.record({
          maxMs: 9000,
          onLevel: (p) => { ring.style.boxShadow = `0 0 0 ${Math.round(p * 30)}px rgba(255,107,129,.12)`; },
        });
        ring.style.boxShadow = '';
        if (!rec.heardSound) {
          show(null);
        } else {
          show(decode(rec.samples, rec.sampleRate),
            `${(rec.samples.length / rec.sampleRate).toFixed(2)} s captured at ${rec.sampleRate} Hz.`);
        }
      } catch (e) {
        out.appendChild(el('div', { class: 'note-box err', text: `Microphone unavailable: ${e.message}. On the web this needs HTTPS and your permission.` }));
      }
      ring.classList.remove('live');
      listenBtn.disabled = false;
      listenBtn.textContent = 'Listen';
    },
  });

  view.appendChild(el('div', { class: 'card center' }, [
    ring,
    el('p', { class: 'small muted', style: 'margin:14px 0', text: 'Play Solra at this device from another one — or from the Compose tab on a phone — and it will read the tones back. Quiet room, speaker within a metre.' }),
    el('div', { class: 'row', style: 'justify-content:center' }, [listenBtn]),
  ]));

  view.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Loopback test' }),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-sm', text: 'Run',
        onclick: () => {
          const ex = drills.pick(EXAMPLES);
          const u = fromText(ex.text);
          const rendered = renderUtterance(u);
          const result = decode(rendered.samples, rendered.sampleRate);
          show(result, `Synthesised "${ex.text}" and decoded the samples directly, with no speaker or microphone in the path.`);
          audio.play(rendered, { gain: progress.settings().volume });
        },
      }),
    ]),
    el('p', { class: 'small muted', style: 'margin:0', text: 'Renders a random utterance and decodes its samples without going through the air. If the loopback is clean but the microphone is not, the problem is the room, not the code.' }),
  ]));

  view.appendChild(out);
  return view;
}

/* ── Settings and notes ───────────────────────────────────────────────── */

function toggleRow(name, desc, key) {
  const input = el('input', { type: 'checkbox' });
  input.checked = !!progress.settings()[key];
  input.addEventListener('change', () => progress.setSetting(key, input.checked));
  return el('div', { class: 'setting' }, [
    el('span', { class: 'setting-main' }, [
      el('div', { class: 'setting-name', text: name }),
      el('div', { class: 'setting-desc', text: desc }),
    ]),
    el('label', { class: 'switch' }, [input, el('i')]),
  ]);
}

function settingsSheet() {
  const s = progress.settings();
  const vol = el('input', {
    type: 'range', min: '0', max: '1', step: '.05', value: String(s.volume),
    style: 'width:120px',
  });
  vol.addEventListener('input', () => progress.setSetting('volume', Number(vol.value)));

  const body = el('div', {}, [
    toggleRow('Randomise pitch', 'Shifts the base frequency on every drill so you learn the intervals instead of memorising absolute pitches. Register drills always play at nominal pitch, because register is defined against it.', 'randomizePitch'),
    toggleRow('Show romanization', 'Reveals do-re-mi spelling after each answer.', 'showRomanization'),
    toggleRow('Play automatically', 'Starts the audio as soon as a question appears.', 'autoplay'),
    el('div', { class: 'setting' }, [
      el('span', { class: 'setting-main' }, [
        el('div', { class: 'setting-name', text: 'Volume' }),
        el('div', { class: 'setting-desc', text: 'Pure tones sound louder than they measure. Start low.' }),
      ]),
      vol,
    ]),
    el('div', { class: 'setting' }, [
      el('span', { class: 'setting-main' }, [
        el('div', { class: 'setting-name', text: 'Progress' }),
        el('div', { class: 'setting-desc', text: 'Everything is in this browser\'s local storage. Nothing is uploaded.' }),
      ]),
      el('button', {
        class: 'btn btn-sm btn-danger', text: 'Reset',
        onclick: () => {
          if (!window.confirm('Erase your deck, schedule and streak?')) return;
          progress.reset();
          close();
          go('learn');
          toast('Progress cleared');
        },
      }),
    ]),
  ]);
  const close = sheet('Settings', body);
}

function aboutSheet() {
  const body = el('div', { class: 'small' }, [
    el('p', { text: 'Every sound in this app is synthesised from the spec\'s own tables at play time. The 192 word addresses are generated from their CLASS/FAMILY/MEMBER position with the check slot computed, so the parity guarantee cannot drift out of sync with the data.' }),
    el('h3', { text: 'Where the spec left a choice', style: 'margin:16px 0 8px' }),
    el('ul', { style: 'padding-left:18px;line-height:1.7;color:var(--muted)' }, [
      el('li', { html: '<strong>Coda anchor.</strong> §3.3 fixes the four shapes but not the pitch they glide from. This implementation anchors every coda to the frequency of the final content slot, which is deterministic from the utterance alone and needs no extra reference.' }),
      el('li', { html: '<strong>Frame arithmetic.</strong> §4 gives both a 720 ms floor for a one-word utterance and "about 1.9 s" for three words. Only the first is exact — 200 + 400 + 120 — so the chirp runs straight into the first slot with no gap between them, and three words come to 1.76 s.' }),
      el('li', { html: '<strong>Dangling relations.</strong> §5.4 says INDEX relations precede their object, but §7\'s own worked example is <code>YOU GO OUT?</code>, with nothing after OUT. The validator flags this as a warning rather than rejecting it, since rejecting the spec\'s own corpus would be wrong and silently dropping the rule would hide a real ambiguity.' }),
      el('li', { html: '<strong>Register needs absolute pitch.</strong> §3.1 recovers register from the preamble, which only works if you already know what pitch a neutral preamble sits at. Pitch randomisation is therefore switched off for register drills, and a compare-with-neutral button stands in for the reference.' }),
      el('li', { html: '<strong>Tempo recovery.</strong> The spec does not say how a decoder finds the urgency level. This one tries all three and keeps whichever divides the recording into a whole number of words with silent gaps where gaps belong.' }),
    ]),
    el('h3', { text: 'What is not here', style: 'margin:16px 0 8px' }),
    el('p', { class: 'muted', text: 'No over-the-air framing, no Reed-Solomon, no LLM layer. §8.2 is right that ggwave already solves transport, and the compiler in §8.3 is a server-side concern. This is the learning tool from §10 and nothing else.' }),
  ]);
  sheet('Notes on the implementation', body);
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

function boot() {
  progress.load();
  const hash = location.hash.replace('#', '');
  if (VIEWS.some((v) => v.id === hash)) currentView = hash;
  buildNav();
  go(currentView);

  $('#btn-settings').addEventListener('click', settingsSheet);
  $('#link-about').addEventListener('click', (e) => { e.preventDefault(); aboutSheet(); });

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (VIEWS.some((v) => v.id === h) && h !== currentView) go(h);
  });

  // First gesture anywhere unlocks the audio context, so the first Play in a
  // session does not silently no-op.
  const kick = () => { audio.unlock(); document.removeEventListener('pointerdown', kick); };
  document.addEventListener('pointerdown', kick);
}

boot();
