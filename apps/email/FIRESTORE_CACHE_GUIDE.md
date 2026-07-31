# Firestore Email Cache

The cache is a local mirror of recent mail, so the list renders without
waiting on the Gmail API and so repeat views don't burn API quota.

## Data model

Everything is scoped to the **Firebase uid**. The Firebase account and the
authorized mailbox are separate identities — see `README.md` — so an email
address is never a key.

```
users/{uid}/
├── private/
│   └── gmail                 Gmail OAuth token. Owner-only.
│       ├── access_token, expires_at, scope
│       └── email, name, picture
├── threads/
│   └── {threadId}
│       ├── subject, snippet
│       ├── participants[], participantEmails[]
│       ├── lastSenderName, lastSenderEmail
│       ├── labelIds[], category, isStarred, hasUnread
│       ├── date (Timestamp), messageCount
│       └── lastUpdated
├── messages/
│   └── {messageId}
│       ├── threadId  (indexed)
│       ├── messageId, references, from, to, cc, replyTo
│       ├── subject, senderName, senderEmail
│       ├── body, bodyTruncated, isHtmlBody
│       ├── date (Timestamp), isUnread, labelIds[]
│       └── attachments[]
└── meta/
    └── sync
        ├── lastSyncByKey  { primary: <millis>, promotions: <millis>, … }
        └── lastSyncDate
```

Thread documents carry everything the list needs — sender, subject, unread
state, category — because list rows are rendered straight from them and never
have a `messages` array. Message bodies are only read when a thread is
opened.

## Loading

`loadThreadsCacheFirst` is gone; the flow lives in `App.js` and is explicit:

1. `loadThreadsFromCache` — most recent 300 threads by date, then filtered
   client-side by category and search text. Rendered immediately.
2. `syncEmailsToCache` — **awaited**, not fired and forgotten. Writes results
   to Firestore.
3. Reload from cache and re-render.

Step 2 being awaited is the point. The previous version started a background
sync and never told React it had finished, so a first load rendered an empty
cache and stopped there.

### Why filtering is client-side

Filtering by category in Firestore would need composite indexes
(`category` + `date`, `isStarred` + `date`), and indexes are deliberately not
deployed from CI — a non-interactive index deploy needs `--force`, which
deletes indexes not present in the file. A missing index makes the query fail
and the list render empty, which is exactly the failure mode this rewrite was
fixing.

The cache window is a few hundred threads, so filtering it in memory costs
nothing and needs no index. The sync is also category-aware, so each tab's
threads actually make it into the cache.

The one composite index this app needs is already in `firestore.indexes.json`:

```json
{
  "collectionGroup": "messages",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "threadId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "ASCENDING" }
  ]
}
```

## Syncing

`syncEmailsToCache(uid, accessToken, { query, pageToken, incremental, syncKey })`

- **Incremental** syncs prepend `after:<epoch seconds>` from that tab's own
  watermark, with 60 seconds of overlap for clock skew. Epoch seconds, not
  `YYYY/MM/DD`: day granularity meant re-fetching the same day forever and
  never backfilling anything older.
- **Watermarks are per tab** (`syncKey`), so paging through Promotions
  doesn't convince the app that Primary is current.
- **Backfill pages** (`pageToken` set) never advance the watermark — a deep
  page says nothing about whether new mail arrived.
- Returns `{ threads, synced, nextPageToken }` so the caller can page.

## Writes

`saveThreadsToCache` batches thread and message writes together, chunked at
450 operations (Firestore's limit is 500) with no artificial delays. If any
batch fails it throws, rather than logging and continuing — a swallowed write
means threads silently missing from the list.

Bodies are capped at 500 KB by `capBodyForStorage` before storage, measured
in UTF-8 bytes rather than characters. Firestore caps a document at 1 MiB,
and large HTML mail exceeds it; trimmed bodies set `bodyTruncated` and the
UI says so.

## Read state

`markThreadReadInCache` clears `hasUnread` on the thread and `isUnread` on
its messages in one batch, alongside the Gmail `modify` call. Without it the
unread dot came back on every reload.

## Costs

Each cached thread is one thread document plus one document per message.
A mailbox synced across five tabs at 25 threads per page is a few hundred
documents — comfortably inside the Firestore free tier, but it does grow with
use. `clearEmailCache(uid)` deletes everything for a user.

If this grows past a comfortable size, IndexedDB is the better home for a
purely local mail cache; Firestore earns its place only for cross-device
sync state.
