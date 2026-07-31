import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  listThreads,
  getThread,
  formatThread,
  categoryFromLabels,
  utf8ByteLength,
} from './gmail';

/** Firestore caps documents at 1 MiB; leave room for the other fields. */
const MAX_BODY_BYTES = 500 * 1024;

/** Firestore caps a write batch at 500 operations. */
const MAX_BATCH_OPS = 450;

/**
 * How many threads to pull from Firestore for a listing. Category and search
 * filtering happen client-side over this window, which keeps the cache free
 * of composite-index requirements — see FIRESTORE_CACHE_GUIDE.md.
 */
const CACHE_PAGE_SIZE = 300;

function getUserThreadsRef(userId) {
  return collection(db, 'users', userId, 'threads');
}

function getUserMessagesRef(userId) {
  return collection(db, 'users', userId, 'messages');
}

function getUserMetaRef(userId) {
  return doc(db, 'users', userId, 'meta', 'sync');
}

/**
 * Sync state is tracked per listing (one per category), so paging through
 * Promotions doesn't convince the app that Primary is up to date.
 */
export async function getLastSyncTime(userId, syncKey = 'default') {
  try {
    const metaDoc = await getDoc(getUserMetaRef(userId));
    if (!metaDoc.exists()) return null;
    const millis = metaDoc.data()?.lastSyncByKey?.[syncKey];
    return typeof millis === 'number' ? millis : null;
  } catch (err) {
    console.error('Error getting last sync time:', err);
    return null;
  }
}

async function updateLastSyncTime(userId, syncKey, millis) {
  try {
    await setDoc(
      getUserMetaRef(userId),
      {
        lastSyncByKey: { [syncKey]: millis },
        lastSyncDate: new Date(millis).toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Error updating last sync time:', err);
  }
}

/**
 * Trim an oversized body so the message document still fits in Firestore.
 * Returns the stored body plus whether it was cut short.
 */
export function capBodyForStorage(body) {
  const text = body || '';
  if (utf8ByteLength(text) <= MAX_BODY_BYTES) return { body: text, truncated: false };

  // The budget is in bytes and characters can be multi-byte, so trim down
  // until it genuinely fits rather than assuming one char is one byte.
  let cut = text.slice(0, MAX_BODY_BYTES);
  while (cut.length > 0 && utf8ByteLength(cut) > MAX_BODY_BYTES) {
    cut = cut.slice(0, Math.floor(cut.length * 0.9));
  }
  return { body: cut, truncated: true };
}

function threadDocData(thread) {
  return {
    id: thread.id,
    subject: thread.subject || '(no subject)',
    snippet: thread.snippet || '',
    participants: thread.participants || [],
    participantEmails: thread.participantEmails || [],
    participantCount: thread.participantCount || 0,
    lastSenderName: thread.lastSenderName || '',
    lastSenderEmail: thread.lastSenderEmail || '',
    hasUnread: thread.hasUnread || false,
    isStarred: thread.isStarred || false,
    labelIds: thread.labelIds || [],
    category: thread.category || categoryFromLabels(thread.labelIds || []),
    date: Timestamp.fromDate(
      thread.date instanceof Date && !isNaN(thread.date) ? thread.date : new Date()
    ),
    messageCount: thread.messages?.length || 0,
    lastUpdated: Timestamp.now(),
  };
}

function messageDocData(message, threadId) {
  const { body, truncated } = capBodyForStorage(message.body);
  return {
    id: message.id,
    threadId,
    messageId: message.messageId || '',
    references: message.references || '',
    from: message.from || '',
    to: message.to || '',
    cc: message.cc || '',
    replyTo: message.replyTo || '',
    subject: message.subject || '',
    senderName: message.senderName || '',
    senderEmail: message.senderEmail || '',
    body,
    bodyTruncated: truncated,
    isHtmlBody: message.isHtmlBody || false,
    snippet: message.snippet || '',
    date: message.internalDate
      ? Timestamp.fromMillis(parseInt(message.internalDate, 10))
      : Timestamp.now(),
    isUnread: message.isUnread || false,
    labelIds: message.labelIds || [],
    attachments: message.attachments || [],
    lastUpdated: Timestamp.now(),
  };
}

/**
 * Save a thread and its messages to Firestore.
 */
export async function saveThreadToCache(userId, thread) {
  return saveThreadsToCache(userId, [thread]);
}

/**
 * Save several threads, chunked to stay inside Firestore's batch limit.
 */
export async function saveThreadsToCache(userId, threads) {
  const threadsRef = getUserThreadsRef(userId);
  const messagesRef = getUserMessagesRef(userId);

  let batch = writeBatch(db);
  let ops = 0;
  const commits = [];

  const flush = () => {
    if (ops === 0) return;
    commits.push(batch.commit());
    batch = writeBatch(db);
    ops = 0;
  };

  for (const thread of threads) {
    batch.set(doc(threadsRef, thread.id), threadDocData(thread), { merge: true });
    ops++;

    for (const message of thread.messages || []) {
      batch.set(doc(messagesRef, message.id), messageDocData(message, thread.id), {
        merge: true,
      });
      ops++;
      if (ops >= MAX_BATCH_OPS) flush();
    }

    if (ops >= MAX_BATCH_OPS) flush();
  }

  flush();

  const results = await Promise.allSettled(commits);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    // Surfaced rather than swallowed: a failed write means threads silently
    // missing from the list, which used to look like "the app lost my mail".
    console.error('Some cache writes failed:', failed.map((f) => f.reason));
    throw new Error(`Failed to cache ${failed.length} of ${commits.length} batches`);
  }
}

/** Does a cached thread match the active search text? */
function matchesSearch(thread, searchQuery) {
  if (!searchQuery) return true;

  // Gmail operators (from:, subject:, has:) are answered by the server sync,
  // not by this local filter — passing them through as literal text would
  // match nothing at all.
  if (/\w+:/.test(searchQuery)) return true;

  const needle = searchQuery.toLowerCase();
  return [
    thread.subject,
    thread.snippet,
    thread.lastSenderName,
    thread.lastSenderEmail,
    ...(thread.participants || []),
    ...(thread.participantEmails || []),
  ].some((field) => String(field || '').toLowerCase().includes(needle));
}

/** Does a cached thread belong in the selected category tab? */
export function matchesCategory(thread, categoryFilter) {
  if (!categoryFilter || categoryFilter === 'all') return true;
  if (categoryFilter === 'starred') return Boolean(thread.isStarred);
  return (thread.category || 'primary') === categoryFilter;
}

/**
 * Load threads from the Firestore cache, filtered to the active tab/search.
 */
export async function loadThreadsFromCache(userId, options = {}) {
  const { limitCount = CACHE_PAGE_SIZE, categoryFilter, searchQuery } = options;

  try {
    const snapshot = await getDocs(
      query(getUserThreadsRef(userId), orderBy('date', 'desc'), limit(limitCount))
    );

    const threads = [];
    snapshot.forEach((snap) => {
      const data = snap.data();
      threads.push({ ...data, date: data.date?.toDate() || new Date() });
    });

    return threads
      .filter((thread) => matchesCategory(thread, categoryFilter))
      .filter((thread) => matchesSearch(thread, searchQuery));
  } catch (err) {
    console.error('Error loading threads from cache:', err);
    return [];
  }
}

/**
 * Load a specific thread with all its messages from cache.
 */
export async function loadThreadFromCache(userId, threadId) {
  try {
    const threadDoc = await getDoc(doc(getUserThreadsRef(userId), threadId));
    if (!threadDoc.exists()) return null;

    const threadData = threadDoc.data();

    const messagesSnapshot = await getDocs(
      query(
        getUserMessagesRef(userId),
        where('threadId', '==', threadId),
        orderBy('date', 'asc')
      )
    );

    const messages = [];
    messagesSnapshot.forEach((snap) => {
      const msgData = snap.data();
      messages.push({
        ...msgData,
        date: msgData.date?.toDate() || new Date(),
        internalDate: msgData.date?.toMillis().toString() || Date.now().toString(),
      });
    });

    if (!messages.length) return null;

    return {
      ...threadData,
      date: threadData.date?.toDate() || new Date(),
      messages,
      lastMessage: messages[messages.length - 1],
      firstMessage: messages[0],
    };
  } catch (err) {
    console.error('Error loading thread from cache:', err);
    return null;
  }
}

/**
 * Reflect a "mark as read" in the cache so unread badges don't come back on
 * the next load.
 */
export async function markThreadReadInCache(userId, threadId, messageIds = []) {
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(getUserThreadsRef(userId), threadId),
      { hasUnread: false, lastUpdated: Timestamp.now() },
      { merge: true }
    );
    messageIds.forEach((id) => {
      batch.set(
        doc(getUserMessagesRef(userId), id),
        { isUnread: false, lastUpdated: Timestamp.now() },
        { merge: true }
      );
    });
    await batch.commit();
  } catch (err) {
    console.error('Error updating read state in cache:', err);
  }
}

/**
 * Fetch a page of threads from Gmail and write them to the cache.
 *
 * Incremental syncs use `after:<epoch seconds>` rather than a `YYYY/MM/DD`
 * date: day granularity meant re-fetching the same day forever and never
 * backfilling anything older.
 */
export async function syncEmailsToCache(userId, accessToken, options = {}) {
  const {
    maxResults = 25,
    query: gmailQuery = '',
    pageToken = null,
    incremental = false,
    syncKey = 'default',
  } = options;

  const startedAt = Date.now();
  let q = gmailQuery;

  if (incremental && !pageToken) {
    const lastSync = await getLastSyncTime(userId, syncKey);
    if (lastSync) {
      // One minute of overlap absorbs clock skew between us and Gmail.
      const after = Math.floor((lastSync - 60 * 1000) / 1000);
      q = q ? `${q} after:${after}` : `after:${after}`;
    }
  }

  const response = await listThreads(accessToken, {
    maxResults,
    pageToken: pageToken || undefined,
    q: q || undefined,
  });

  const threadIds = (response.threads || []).map((t) => t.id);
  if (!threadIds.length) {
    if (!pageToken) await updateLastSyncTime(userId, syncKey, startedAt);
    return { threads: [], synced: 0, nextPageToken: response.nextPageToken || null };
  }

  const batchSize = 10;
  const allThreads = [];
  for (let i = 0; i < threadIds.length; i += batchSize) {
    const chunk = threadIds.slice(i, i + batchSize);
    const details = await Promise.all(
      chunk.map((id) => getThread(accessToken, id).catch(() => null))
    );
    details.filter(Boolean).forEach((t) => allThreads.push(formatThread(t)));
  }

  await saveThreadsToCache(userId, allThreads);

  // Only a first page advances the watermark — a deep backfill page says
  // nothing about whether new mail has arrived since.
  if (!pageToken) await updateLastSyncTime(userId, syncKey, startedAt);

  return {
    threads: allThreads,
    synced: allThreads.length,
    nextPageToken: response.nextPageToken || null,
  };
}

/**
 * Clear all cached mail for a user.
 */
export async function clearEmailCache(userId) {
  const [threadsSnapshot, messagesSnapshot] = await Promise.all([
    getDocs(getUserThreadsRef(userId)),
    getDocs(getUserMessagesRef(userId)),
  ]);

  const refs = [
    ...threadsSnapshot.docs.map((d) => d.ref),
    ...messagesSnapshot.docs.map((d) => d.ref),
  ];

  for (let i = 0; i < refs.length; i += MAX_BATCH_OPS) {
    const batch = writeBatch(db);
    refs.slice(i, i + MAX_BATCH_OPS).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  await setDoc(getUserMetaRef(userId), { lastSyncByKey: {} }, { merge: true });
}
