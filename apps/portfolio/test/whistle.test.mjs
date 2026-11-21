/* Whistle Rig: pitch tracking, note splitting, instruments and MIDI.
 *
 * Run: node apps/portfolio/test/whistle.test.mjs
 */
import * as P from '../../whistle/js/pitch.js';
import { render, INSTRUMENTS } from '../../whistle/js/synth.js';
import { toMidi, bendValue } from '../../whistle/js/midi.js';
import { encodeWav } from '../../whistle/js/wav.js';

let failures = 0, passes = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`); }
};
const SR = P.ANALYSIS_SR;
const tone = (hz, sec, amp = 0.3) => Float32Array.from({ length: Math.floor(sec * SR) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / SR));

console.log('pitch');
{
  const d = new Float32Array(200);
  for (const hz of [523.25, 1046.5, 1760, 2637]) {
    const r = P.yin(tone(hz, 0.1), 0, P.WIN, SR, d);
    ok(`yin finds ${hz} Hz within 5 cents`, Math.abs(1200 * Math.log2(r.hz / hz)) < 5, r.hz);
  }
  ok('note names', P.noteName(69) === 'A4' && P.noteName(60) === 'C4' && P.noteName(83.4) === 'B5');
  ok('snap to G major', P.snap(77.4, 7, 'major') === 78 && P.snap(76.6, 7, 'major') === 76);
  ok('snap to chromatic', P.snap(70.6) === 71);
  ok('snap to minor pentatonic skips the 2nd', P.snap(66, 4, 'minpent') !== 66);
}

console.log('demo whistle');
const raw = await P.analyze(P.demoWhistle());
const tr = P.track(raw);
const notes = P.segment(tr, 0.5);
{
  const want = [79, 81, 83, 83, 83, 81, 79, 76, 74, 76, 79, 81, 79];
  ok('finds all 13 notes, tongued repeats included', notes.length === 13, notes.length);
  ok('every note on the right pitch', notes.every((n, i) => Math.abs(n.center - want[i]) < 0.3), notes.map((n) => +n.center.toFixed(2)));
  ok('the slow slide stays one bent note', notes[7].end - notes[7].start > 80);
  const key = P.detectKey(notes);
  ok('key is G major or its relative E minor', key && ((key.tonic === 7 && key.mode === 'major') || (key.tonic === 4 && key.mode === 'minor')), key);
  ok('lower splitting merges more', P.segment(tr, 0).length <= notes.length && P.segment(tr, 1).length >= notes.length);
  ok('silence gives no notes', P.segment(P.track({ hz: new Float32Array(300), clarity: new Float32Array(300), rms: new Float32Array(300).fill(1e-5), hop: 0.01 })).length === 0);
}

console.log('perform');
{
  const flat = P.perform(tr, notes, { transpose: -12, correction: 1, bends: 0 });
  const n = flat.notes[0];
  ok('octave down, flat notes when bends are off', flat.pitch[n.start + 5] === 67 && flat.pitch[n.end - 1] === 67);
  const bent = P.perform(tr, notes, { transpose: 0, correction: 1, bends: 1 });
  const b = bent.notes[7];
  ok('bend climbs two semitones from the fretted note', Math.abs(bent.pitch[b.end - 3] - b.pitch - 2) < 0.3, [b.pitch, bent.pitch[b.end - 3]]);
}

console.log('instruments');
for (const name of Object.keys(INSTRUMENTS)) {
  const perf = P.perform(tr, notes, { transpose: 12 * INSTRUMENTS[name].octave });
  const y = render(perf, name, { sr: 24000 });
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
  ok(`${name} renders clean audio`, y.every(Number.isFinite) && peak > 0.5 && peak <= 0.86, peak);
}
{
  const perf = P.perform(tr, notes, { transpose: -12, correction: 1 });
  const y = render(perf, 'clean', { sr: 24000 });
  const back = P.track(await P.analyze(y));
  const errs = perf.notes.filter((n) => n.end - n.start > 25).map((n) => {
    const m = (n.start + n.end) >> 1; return Math.abs(back.midi[m] - perf.pitch[m]);
  }).filter((e) => !isNaN(e));
  ok('clean guitar plays in tune (within 20 cents)', errs.length > 6 && errs.every((e) => e < 0.2), errs.map((e) => +e.toFixed(3)));
}

console.log('midi + wav');
{
  const perf = P.perform(tr, notes, { transpose: -12 });
  const mid = toMidi(perf, { program: 29 });
  ok('MIDI header', String.fromCharCode(...mid.slice(0, 4)) === 'MThd' && String.fromCharCode(...mid.slice(14, 18)) === 'MTrk');
  const len = (mid[18] << 24) | (mid[19] << 16) | (mid[20] << 8) | mid[21];
  ok('track length matches', len === mid.length - 22);
  let ons = 0; for (let i = 22; i < mid.length - 2; i++) if (mid[i] === 0x90 && mid[i + 2] > 0) ons++;
  ok('a note-on per note', ons >= perf.notes.length);
  ok('bend centre and range', bendValue(0) === 8192 && bendValue(12) === 16383 && bendValue(-12) === 0 && bendValue(2) === 9557);
  const wav = new DataView(encodeWav([new Float32Array([0, 1, -1])], 44100));
  ok('WAV header and samples', wav.getUint32(0) === 0x52494646 && wav.getInt16(46, true) === 32767 && wav.getInt16(48, true) === -32768);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
