# Solra Trainer

A practice tool for **Solra**, a constructed language whose phonemes are pure
tones rather than vowels and consonants. Served at
`joshcocciardi.com/projects/solra`.

Static: no build step, no framework, no dependencies. Open `index.html` and it
runs. Every sound is synthesised in the browser from the spec's own tables at
play time — there is no recorded audio anywhere in the app.

## What it does

| Tab | What it is for |
|---|---|
| **Learn** | Four foundation lessons (the chirp and the eight tones, prosody, the class prefixes, the shape of a word) and the 24 word families. Adding a family puts its eight words into your deck. |
| **Drill** | Fifteen-question sessions across ten drill types, scheduled by a five-box Leitner system. |
| **Dictionary** | All 192 words, searchable by gloss, romanization, address, family or hint. Every entry plays. |
| **Compose** | Build an utterance, set its prosody, hear it, and run it through the deterministic validator from §8.3. |
| **Decode** | Listen through the microphone and read the tones back, or run a loopback that decodes the synthesiser's own samples with no speaker in the path. |

Progress lives in this browser's `localStorage`. There is no account and
nothing is uploaded.

## The drills

Ordered the way §10 of the spec asks for:

- **Ear training** — the two-note chirp as a pitch reference, then a tone to
  name. The base frequency is randomised by default so you learn the intervals
  rather than memorising absolute pitches.
- **Class prefix** — the first tone of every word names its class, which cuts
  the search space by eight on every word forever. Drilled early and often.
- **Prosody** — register, urgency and coda. Six distinctions that carry most of
  the comprehension before any vocabulary at all.
- **Minimal pairs** — the eight members of one family, which differ by a single
  slot and are therefore maximally confusable. This is the drill the language
  is shaped for.
- **Comprehension, production, parity, sentences** — recognition against a
  mixed field, romanization recall with the audio withheld, a cloze drill that
  makes you derive a muted slot from the check digit, and whole utterances
  against their English readings.

Which drill a word gets depends on how well you know it: recognition inside its
family first, then open recognition, then production and parity.

## Layout

```
js/lexicon.js     the language: 8 tones, 24 families, 192 words, prosody sets
js/utterance.js   notation parser and the §8.3 validator
js/synth.js       rendering to a Float32Array — no Web Audio, so it is testable
js/decode.js      Goertzel decoding, register and tempo recovered by search
js/audio.js       the only file that touches AudioContext: playback and capture
js/progress.js    Leitner scheduling, deck, streak, settings — all localStorage
js/drills.js      question generators and session planning
js/app.js         views
test/roundtrip.mjs
```

Word addresses are **generated**, never transcribed. A word is defined by its
CLASS/FAMILY/MEMBER position in `lexicon.js` and the CHECK slot is computed, so
the parity guarantee in §2 cannot drift out of sync with the data.

## Tests

```
cd apps/solra && npm test
```

645 checks, no dependencies, no browser. It renders every one of the 192 words
and decodes the samples back; runs all 36 register × urgency × coda
combinations through the same round trip; confirms the 720 ms floor and the
per-urgency frame arithmetic; proves by exhaustion that no single-slot error
produces a different valid word; and corrupts a slot to confirm the decoder
emits `AGAIN` rather than guessing.

## Where the spec left a choice

The app's "notes on the implementation" panel says this too, in the footer.

- **Coda anchor.** §3.3 fixes the four shapes but not the pitch they glide
  from. Every coda here anchors to the frequency of the final content slot,
  which is deterministic from the utterance alone and needs no extra reference.
- **Frame arithmetic.** §4 gives both a 720 ms floor for a one-word utterance
  and "about 1.9 s" for three words. Only the first is exact — 200 + 400 + 120
  — so the chirp runs straight into the first slot with no gap, and three words
  come to 1.76 s rather than 1.9.
- **Dangling relations.** §5.4 says INDEX relations precede their object, but
  §7's own worked example is `YOU GO OUT?`, with nothing after OUT. The
  validator flags this as a warning rather than rejecting it: rejecting the
  spec's own corpus would be wrong, and dropping the rule would hide a real
  ambiguity.
- **Register needs absolute pitch.** §3.1 recovers register from the preamble,
  which only works if you already know what pitch a neutral preamble sits at.
  Pitch randomisation is therefore off for register drills, and a
  compare-with-neutral button stands in for the reference.
- **Tempo recovery.** The spec does not say how a decoder finds the urgency
  level. This one tries all three and keeps whichever divides the recording
  into a whole number of words with silence where the gaps belong.

## Not implemented

No over-the-air framing, no Reed-Solomon, no LLM compiler. §8.2 is right that
`ggwave` already solves transport, and §8.3's compiler is a server-side
concern. This is the learning tool from §10 and nothing else.

## Browser support

Web Audio for playback everywhere. The microphone decoder prefers an
`AudioWorklet` and falls back to `ScriptProcessorNode`; it needs HTTPS (or
localhost) and the user's permission.
