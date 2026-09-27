# My Reading Buddy (`/tools/myreadingbuddy`)

Photograph a picture book one open spread at a time, read each spread aloud,
and the kids can pick the book off the shelf, press play, and hear it read to
them. It reads itself: when a page's recording ends, the page turns (a 3D page
flip) and the next one starts.

## Using it

**Grown-ups** (toggle in the header, remembered per device):

1. **+ New book**: give it a title and who's reading ("Mom").
2. **+ Add pages**: take a photo of each spread or pick scans. Photos go in
   the order picked (numbered file names like `scan 2.jpg` / `IMG_4410.JPG`
   sort by their numbers). They're shrunk to 2400px JPEGs before upload.
   Reorder with ↑ ↓, remove with ✕.
3. **Record the book**: shows the spread full screen. Tap the mic, read the
   page, tap stop. The take uploads and the page turns to the next one that
   still needs a voice. Any page can be played back or redone.

**Kids** (Grown-ups off): just the covers. Tap one, press the big play
button. Pause, the arrows, or a swipe turn pages by hand; if it was reading it
carries on from the new page. The screen stays awake while it reads.

## Sharing

A **bookshelf** owns the books, shared by verified Google email (same model
as the Meal Planner's households). One parent can record while away and the
kids listen at home on the other parent's login. Add people in **settings**
(visible in Grown-ups mode).

## Data

- Firestore `readingbuddy_shelves/{sid}`: `name, ownerUid, memberEmails[]`
- Firestore `readingbuddy_shelves/{sid}/books/{bid}`: `title, readBy, pages[]`,
  where a page is `{ id, image: {url, path, w, h}, audio: {url, path, type, secs} | null }`.
  Every change to `pages` runs in a transaction.
- Storage `readingbuddy/{sid}/{bid}/`: `{pageId}.jpg` and
  `{pageId}-{stamp}.m4a|webm`. A new take gets a new file name; the old one is
  deleted.

Rules: `firestore.rules` (members only, verified email) and `storage.rules`
(verified sign-in plus the unguessable path, like the Collector Shop, since
Storage rules can't read Firestore membership).

## Recording formats

MP4/AAC is preferred wherever the browser can record it (Safari, current
Chrome), because every device can play it back. Browsers that can only record
WebM/Opus fall back to that; older iPads may not play those takes.

## Files

| File | What |
| --- | --- |
| `index.jsx` | Auth, shelf, and which screen is showing |
| `Shelf.jsx` | Shelf setup, settings, the book grid, new-book form |
| `Editor.jsx` | A book's title, pages, and recording status |
| `Recorder.jsx` | Page-by-page recording |
| `Reader.jsx` | Kids' playback |
| `Spread.jsx` | Sizing a spread to the screen, and the page flip |
| `book.js` | Pure helpers (tested in `test/readingbuddy.test.mjs`) |
| `media.js` | Photo shrinking, MediaRecorder, wake lock |
| `store.js` | Firestore + Storage |

## Deploy

`./deploy.sh myreadingbuddy` (portfolio build, Firestore + Storage rules,
hosting). Merging to master does the same through CI.

Local run against emulators (auth, Firestore, Storage):

```sh
firebase emulators:start --only auth,firestore,storage --project josh-cocciardi
cd apps/portfolio && REACT_APP_FIREBASE_EMULATORS=1 npm start
```
