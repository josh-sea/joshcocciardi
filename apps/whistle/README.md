# Whistle Rig

Whistle a melody, optionally along with a song, and hear it played back on
overdrive guitar, clean guitar, bass, synth lead, violin, trumpet or flute.
Served at `/projects/whistle` (short link `/whistle`). Static, no build step.

## How it works

1. **Record.** The mic is captured raw (echo cancellation, noise suppression
   and auto-gain off, so the pitch stays clean). If a song is loaded it plays
   from the chosen start point while you record, and the take remembers where
   in the song it began. Use headphones so the mic only hears you.
2. **Pitch tracking** (`js/pitch.js`). Audio is resampled to 24 kHz and run
   through YIN every 10 ms. The curve is cleaned up: octave slips pulled back,
   short dropouts bridged, blips dropped.
3. **Note splitting.** A fast jump in pitch, or a dip and rise in loudness
   (tonguing), starts a new note. A slow slide stays one note and is played as
   a bend from where it started. "Note splitting" sets how eager this is.
4. **Performance.** Each note is pulled toward the scale ("Pitch correction")
   and the slides and vibrato inside it are kept or flattened ("Bends and
   vibrato"). The key is auto-detected (Krumhansl-Schmuckler).
5. **Instruments** (`js/synth.js`). Rendered sample by sample in a worker.
   Guitars and bass are Karplus-Strong strings whose length follows the pitch
   curve, so slides become string bends; the overdrive runs through a clipper
   and a cabinet filter. The others are filtered oscillators shaped by how
   loud you whistled.
6. **Playback** mixes instrument, song and the original whistle, with room
   reverb and echo. "Sync with song" nudges the take against the song.

Exports: a WAV of the mix, and a MIDI file whose bends are pitch bend with
the range set to 12 semitones, for real guitar patches in a DAW. Takes are
saved in IndexedDB in the browser.

## Tests

    node apps/portfolio/test/whistle.test.mjs
