/* The music panel's wiring.
 *
 * Separate from js/music.js on purpose: that file is pure enough to import in
 * node and is covered by the test suite, while everything here touches the
 * DOM. This module is imported the first time somebody taps the music button
 * and never before, so the ticket book still loads with no extra requests.
 */

import * as music from './music.js';
import { TRACKS } from '../music/tracks.js';

const $ = id => document.getElementById(id);

let els = null;
let objectUrls = [];

/* The page already has a sound switch for the trivia effects. "Sound off"
 * has to mean silence, music included, but the trivia script that owns that
 * button is inline and untouched by any of this. Watching its aria-pressed
 * attribute gets the state without editing that script at all.
 */
function followSoundToggle() {
  const sound = $('sound');
  if (!sound) return;
  const apply = () => music.setSilenced(sound.getAttribute('aria-pressed') === 'false');
  new MutationObserver(apply).observe(sound, { attributes: true, attributeFilter: ['aria-pressed'] });
  apply();
}

function titleFor(track) {
  return track.title || music.trackLabel(track.src);
}

function paint() {
  if (!els) return;
  const playing = music.isPlaying();
  const now = music.currentTrack();

  els.play.dataset.playing = playing ? 'yes' : 'no';
  els.play.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
  els.btn.dataset.playing = playing ? 'yes' : 'no';

  const list = music.listTracks();
  els.title.textContent = now ? titleFor(now) : (list.length ? 'Ready' : 'No music yet');
  els.credit.textContent = now && now.credit ? now.credit : '';
  els.skip.disabled = list.length < 2;

  // Chips in play order, so tapping the one after the current one is next.
  const inOrder = list.slice().sort((a, b) => a.index - b.index);
  els.list.replaceChildren(...inOrder.map(track => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = titleFor(track);
    if (now && now.src === track.src) b.setAttribute('aria-current', 'true');
    b.onclick = () => { music.play(track.index); };
    return b;
  }));

  els.note.textContent = list.length
    ? ''
    : 'Nothing is bundled with the game yet. Pick a file from this device and it plays straight off your phone, nothing uploaded.';
}

function takeFiles(files) {
  const picked = Array.from(files || []).filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name));
  if (!picked.length) return;
  picked.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    // Only the first one starts playing; the rest queue behind it.
    music.addTrack({ src: url, title: music.trackLabel(file.name), credit: 'From this device' }, i === 0);
  });
  paint();
}

export function init() {
  if (els) return;
  els = {
    btn: $('music-btn'),
    panel: $('music'),
    play: $('music-play'),
    skip: $('music-skip'),
    vol: $('music-vol'),
    list: $('music-list'),
    file: $('music-file'),
    title: $('music-title'),
    credit: $('music-credit'),
    note: $('music-note'),
  };

  music.observe(paint);
  music.setTracks(TRACKS);
  followSoundToggle();

  /* Opening the panel is a user gesture, which is exactly what a browser
   * wants before it will start audio. So somebody who left the music on last
   * time gets it back here rather than on page load, where it would be
   * blocked anyway.
   */
  if (music.wasWanted() && music.listTracks().length) music.play();

  els.vol.value = String(music.getVolume());
  els.vol.oninput = () => music.setVolume(els.vol.value);
  els.play.onclick = () => music.toggle();
  els.skip.onclick = () => music.next();
  els.file.onchange = () => { takeFiles(els.file.files); els.file.value = ''; };

  // Dropped files work too, which is the quicker route on a laptop.
  els.panel.addEventListener('dragover', e => { e.preventDefault(); });
  els.panel.addEventListener('drop', e => { e.preventDefault(); takeFiles(e.dataTransfer && e.dataTransfer.files); });

  window.addEventListener('pagehide', () => { objectUrls.forEach(URL.revokeObjectURL); objectUrls = []; });

  paint();
}

export function show(open) {
  const panel = $('music');
  const btn = $('music-btn');
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(Boolean(open)));
}
