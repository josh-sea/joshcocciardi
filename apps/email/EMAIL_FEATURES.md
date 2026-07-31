# Features

What the app actually does today. See `README.md` for setup and
architecture.

## Reading

**Category tabs** — Primary, Promotions, Social, Updates, Starred. The tab
drives both the Gmail query (`category:promotions`, `is:starred`) and the
filter applied to the cached list, so switching tabs changes what you see.
Threads carry a `category` derived from their Gmail labels; anything without
a category label is treated as Primary, matching Gmail's own behavior.

**Search** — debounced 500 ms, passed to Gmail as a query, so the full
operator syntax works:

| Query | Finds |
|---|---|
| `from:ada` | mail from Ada |
| `subject:lunch` | subject matches |
| `has:attachment` | messages with attachments |
| `after:2026/01/01` | mail after a date |
| `is:unread` | unread only |

Plain text searches also filter the local cache immediately, so results
appear before Gmail answers. Operator searches wait for the server, since
they can't be evaluated against cached fields.

**Grouping** — "By Thread" is a flat list. "By Sender" groups the list into
sections under each sender's name. Rows stay real threads in both modes, so
opening one always opens a conversation Gmail knows about.

**Pagination** — scrolling within 400 px of the bottom backfills the next
page of older mail using Gmail's page token, writing each page into the
cache. "No more emails" appears when Gmail stops returning a page token.

**Message bodies** — rendered in a sandboxed iframe (see README). Quoted
history is detected and collapsed behind a "Show quoted text" button; the
split is conservative and never discards content, so a newsletter that merely
contains the words "on … wrote:" keeps its body.

**Images** — blocked by CSP until you choose "Display images" (this message)
or "Always display" (this session). Blocking covers `<img>`, `srcset` and CSS
background images.

**Attachments** — listed per message with size, downloaded on demand through
the Gmail attachments endpoint.

## Writing

**Replies** — sent to the last message's `Reply-To`, falling back to `From`.
If you sent the last message, the reply goes to *its* recipients rather than
back to yourself. "Reply all" adds the remaining To and Cc recipients, minus
your own address.

Threading headers are set properly: `In-Reply-To` is the last message's
Message-ID and `References` accumulates the existing chain rather than
replacing it, so other clients thread the conversation correctly.

Subjects come from the message being replied to, prefixed `Re:` only when it
isn't already. Non-ASCII subjects are RFC 2047 encoded. Typed text is HTML
escaped, so a message containing `<` or `&` sends as written.

**Compose** — To / Cc / Subject / body, with comma or semicolon separated
recipients.

**Read state** — opening a thread marks its unread messages read in Gmail
*and* in the cache, so the unread dot doesn't come back on reload.

## Sync behavior

- First load of a tab: 25 threads, written to the cache.
- Later loads: incremental, using `after:<epoch seconds>` from that tab's own
  watermark with a minute of overlap for clock skew.
- Backfill pages advance the page token but not the watermark — a deep page
  says nothing about whether new mail has arrived.
- Message bodies over 500 KB are trimmed before storage (Firestore caps
  documents at 1 MiB) and flagged in the UI.
- Failed cache writes surface as an error instead of being swallowed.

## Not built yet

- Drafts, forwarding, and rich-text composing
- Labels, archiving, delete, star toggling
- Attachments on outgoing mail
- Push notifications for new mail
- Frequent contacts pinned to the top of the inbox, iMessage style
