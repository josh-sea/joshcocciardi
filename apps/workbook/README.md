# Workbook Reader

A reading aid for a young child who can read *a little* but needs help getting
through workbook pages on their own. Take a photo of a workbook page, and AI
rebuilds the questions and directions on screen — then **tapping any word reads
it aloud**. The child still does the actual work in their paper workbook; this
just makes the directions understandable.

Built for Bodhi. Served at **https://www.joshcocciardi.com/projects/workbook**
as part of the monorepo's portfolio hosting target. Shares the `josh-cocciardi`
Firebase project (Auth, Firestore, Storage, Functions, AI Logic) with the other
apps here.

## How it works

Vite + React 19 + Tailwind 4 PWA, same pattern as `apps/moment-capture` and
`apps/collector`.

1. **Capture** (`components/Capture`) — snap or pick a page. The image is
   compressed in-browser to stay under the 5 MB Storage cap
   (`utils/image.js`), then sent to **Gemini via Firebase AI Logic**
   (`services/vision.service.js`) — the *same* no-API-key-on-the-client pattern
   Collector and Recipe Box use. The model transcribes the page into ordered
   `blocks` (heading / direction / question / passage / example / choice) —
   verbatim, never solving anything. The grown-up reviews and edits the text,
   then saves.
2. **Read** (`components/Reader`) — the saved page is rebuilt on screen. Every
   real word is a tappable target (`Reader/Word.jsx`); tapping speaks just that
   word and highlights it.
3. **Speak** (`services/tts.service.js`) — see below.

## The voice, and why it's cheap

Taps are **single words**, so the audio cache is a small, dense, *universal*
set. Playback resolves in this order:

1. **In-memory** — instant replay in a session.
2. **Shared cloud cache** — a Firestore doc `workbook_audio/{slug}` → a Storage
   mp3 that *any* user already generated. Every child benefits from every other
   child's taps, so "the", "and", "it" are free forever after the first time
   anyone anywhere taps them.
3. **Cloud generate** — on a miss, the `synthesizeWord` Cloud Function
   (Google Cloud Text-to-Speech) makes the clip once; the client uploads it to
   the shared cache so it's never generated again.
4. **On-device fallback** — offline or cloud unavailable → the browser's
   built-in speech reads the word. Works on older devices too (no Apple
   Intelligence required); it just can't be cached.

The **Word Bank** screen (grown-ups) pre-warms the ~200 most common English
words in one pass so they're instant from day one.

### Data model

| Firestore | Purpose |
|---|---|
| `workbook_users/{adultUid}` | grown-up profile |
| `workbook_users/{adultUid}/kids/{kidId}` | one child |
| `workbook_users/{adultUid}/kids/{kidId}/pages/{pageId}` | a saved page (`title`, `blocks`, image ref) |
| `workbook_audio/{slug}` | **shared, cross-user** word-audio cache (immutable) |

| Storage | Purpose |
|---|---|
| `workbook/{adultUid}/{kidId}/{pageId}/original.jpg` | original page photo (owner-only) |
| `workbook/audio/{slug}.mp3` | **shared** word clip (any signed-in user reads; adds on miss) |

Pages are private to the adult's account. Only the spoken-word audio is shared.

## Local development

```bash
cd apps/workbook
cp .env.example .env.local   # fill in the josh-cocciardi Firebase web config
npm install
npm run dev
```

## Deploy

```bash
./deploy.sh workbook   # from the repo root
```

That builds the app into the portfolio, deploys hosting + Firestore/Storage
rules, and deploys the `synthesizeWord` function.

### One-time project setup

- **AI Logic** — in the Firebase console, enable the **Gemini Developer API**
  under *AI Logic* for `josh-cocciardi` (same requirement as Collector/Recipe
  Box). Without it, page reading shows a friendly "AI isn't switched on" error.
- **Cloud Text-to-Speech API** — enable it on the GCP project so
  `synthesizeWord` can generate voice clips. Until it's on (or if it ever
  fails), words still read aloud via the on-device fallback — they just aren't
  cached. Override the voice with the `WORKBOOK_TTS_VOICE` env var on the
  function (default `en-US-Neural2-F`).
