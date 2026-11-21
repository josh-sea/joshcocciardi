/* Whistle Rig: Standard MIDI File export.
 *
 * One track. Each note is a MIDI note at its corrected pitch, and the
 * slides and vibrato ride on pitch bend with the bend range set to a full
 * octave, so a DAW guitar patch bends the way the whistle did.
 */

const PPQ = 480;
const TICKS_PER_SEC = 960;   // 120 bpm
export const BEND_RANGE = 12;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

export function bendValue(semis, range = BEND_RANGE) {
  return Math.max(0, Math.min(16383, Math.round(8192 + (semis / range) * 8192)));
}

export function toMidi(perf, { program = 29, channel = 0 } = {}) {
  const ch = channel & 15;
  const ev = [];   // {t, order, bytes}
  const add = (t, order, bytes) => ev.push({ t, order, bytes });
  const tick = (frame) => Math.round(frame * perf.hop * TICKS_PER_SEC);
  const cc = (n, v) => [0xb0 | ch, n, v];

  add(0, 0, [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]);           // 120 bpm
  add(0, 0, [0xff, 0x03, 11, ...Array.from('Whistle Rig', (c) => c.charCodeAt(0))]);
  add(0, 0, [0xc0 | ch, program & 127]);
  // Pitch bend range: RPN 0 = BEND_RANGE semitones, then close the RPN.
  for (const b of [cc(101, 0), cc(100, 0), cc(6, BEND_RANGE), cc(38, 0), cc(101, 127), cc(100, 127)]) add(0, 0, b);

  perf.notes.forEach((n) => {
    const key = Math.max(0, Math.min(127, Math.round(n.pitch)));
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 110 + 10)));
    const t0 = tick(n.start), t1 = Math.max(t0 + 1, tick(n.end));
    let last = -1;
    for (let k = n.start; k < n.end; k++) {
      const p = perf.pitch[k];
      if (isNaN(p)) continue;
      const v = bendValue(p - key);
      if (last < 0 || Math.abs(v - last) >= 24) {
        add(k === n.start ? t0 : tick(k), 1, [0xe0 | ch, v & 127, v >> 7]);
        last = v;
      }
    }
    add(t0, 2, [0x90 | ch, key, vel]);
    add(t1, 0, [0x80 | ch, key, 0]);
  });

  ev.sort((a, b) => a.t - b.t || a.order - b.order);
  const body = [];
  let now = 0;
  for (const e of ev) { body.push(...vlq(e.t - now), ...e.bytes); now = e.t; }
  body.push(0, 0xff, 0x2f, 0x00);

  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255];
  const len = body.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255];
  return new Uint8Array([...head, ...trk, ...body]);
}
