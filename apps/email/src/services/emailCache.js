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
  Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { listThreads, getThread, formatThread } from './gmail';

/**
 * Get the user's email cache collection reference
 */
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
 * Get the last sync timestamp for a user
 */
export async function getLastSyncTime(userId) {
  try {
    const metaDoc = await getDoc(getUserMetaRef(userId));
    if (metaDoc.exists()) {
      const data = metaDoc.data();
      return data.lastSyncTime?.toDate() || null;
    }
    return null;
  } catch (err) {
    console.error('Error getting last sync time:', err);
    return null;
  }
}

/**
 * Update the last sync timestamp
 */
async function updateLastSyncTime(userId) {
  try {
    await setDoc(getUserMetaRef(userId), {
      lastSyncTime: Timestamp.now(),
      lastSyncDate: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('Error updating last sync time:', err);
  }
}

/**
 * Save a thread to Firestore
 */
export async function saveThreadToCache(userId, thread) {
  try {
    const threadRef = doc(getUserThreadsRef(userId), thread.id);
    
    // Store thread metadata
    const threadData = {
      id: thread.id,
      subject: thread.subject || '(no subject)',
      snippet: thread.snippet || '',
      participants: thread.participants || [],
      participantCount: thread.participantCount || 0,
      hasUnread: thread.hasUnread || false,
      date: Timestamp.fromDate(thread.date),
      messageCount: thread.messages?.length || 0,
      lastUpdated: Timestamp.now()
    };
    
    await setDoc(threadRef, threadData, { merge: true });
    
    // Store individual messages
    if (thread.messages && thread.messages.length > 0) {
      const batch = writeBatch(db);
      const messagesRef = getUserMessagesRef(userId);
      
      thread.messages.forEach((message) => {
        const msgRef = doc(messagesRef, message.id);
        const messageData = {
          id: message.id,
          threadId: thread.id,
          messageId: message.messageId || '',
          from: message.from || '',
          to: message.to || '',
          subject: message.subject || '',
          senderName: message.senderName || '',
          senderEmail: message.senderEmail || '',
          body: message.body || '',
          snippet: message.snippet || '',
          date: message.internalDate ? Timestamp.fromMillis(parseInt(message.internalDate, 10)) : Timestamp.now(),
          isUnread: message.isUnread || false,
          labelIds: message.labelIds || [],
          attachments: message.attachments || [],
          lastUpdated: Timestamp.now()
        };
        batch.set(msgRef, messageData, { merge: true });
      });
      
      await batch.commit();
    }
  } catch (err) {
    console.error('Error saving thread to cache:', err);
    throw err;
  }
}

/**
 * Save multiple threads to Firestore in batches
 * Process sequentially to avoid overwhelming Firestore write stream
 */
export async function saveThreadsToCache(userId, threads) {
  const batchSize = 5; // Smaller batch size to avoid write stream limits
  const delayBetweenBatches = 500; // 500ms delay between batches
  
  for (let i = 0; i < threads.length; i += batchSize) {
    const batch = threads.slice(i, i + batchSize);
    
    // Process each thread in the batch sequentially (not concurrently)
    for (const thread of batch) {
      try {
        await saveThreadToCache(userId, thread);
      } catch (err) {
        console.error(`Error saving thread ${thread.id}:`, err);
        // Continue with next thread even if one fails
      }
    }
    
    // Add delay between batches to prevent overwhelming Firestore
    if (i + batchSize < threads.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
}

/**
 * Load threads from Firestore cache
 */
export async function loadThreadsFromCache(userId, options = {}) {
  try {
    const {
      limitCount = 50,
      categoryFilter,
      searchQuery,
      dateFilter // 'today', 'week', 'month'
    } = options;
    
    let q = query(
      getUserThreadsRef(userId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
    
    // Add date filter if specified
    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      q = query(
        getUserThreadsRef(userId),
        where('date', '>=', Timestamp.fromDate(today)),
        orderBy('date', 'desc'),
        limit(limitCount)
      );
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      q = query(
        getUserThreadsRef(userId),
        where('date', '>=', Timestamp.fromDate(weekAgo)),
        orderBy('date', 'desc'),
        limit(limitCount)
      );
    } else if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      q = query(
        getUserThreadsRef(userId),
        where('date', '>=', Timestamp.fromDate(monthAgo)),
        orderBy('date', 'desc'),
        limit(limitCount)
      );
    }
    
    const snapshot = await getDocs(q);
    const threads = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      threads.push({
        ...data,
        date: data.date?.toDate() || new Date()
      });
    });
    
    return threads;
  } catch (err) {
    console.error('Error loading threads from cache:', err);
    return [];
  }
}

/**
 * Load a specific thread with all its messages from cache
 */
export async function loadThreadFromCache(userId, threadId) {
  try {
    // Get thread metadata
    const threadDoc = await getDoc(doc(getUserThreadsRef(userId), threadId));
    
    if (!threadDoc.exists()) {
      return null;
    }
    
    const threadData = threadDoc.data();
    
    // Get all messages for this thread
    const messagesQuery = query(
      getUserMessagesRef(userId),
      where('threadId', '==', threadId),
      orderBy('date', 'asc')
    );
    
    const messagesSnapshot = await getDocs(messagesQuery);
    const messages = [];
    
    messagesSnapshot.forEach((doc) => {
      const msgData = doc.data();
      messages.push({
        ...msgData,
        date: msgData.date?.toDate() || new Date(),
        internalDate: msgData.date?.toMillis().toString() || Date.now().toString()
      });
    });
    
    // Construct full thread object
    const lastMessage = messages[messages.length - 1];
    const firstMessage = messages[0];
    
    return {
      id: threadData.id,
      subject: threadData.subject,
      snippet: threadData.snippet,
      participants: threadData.participants,
      participantCount: threadData.participantCount,
      hasUnread: threadData.hasUnread,
      date: threadData.date?.toDate() || new Date(),
      messages,
      lastMessage,
      firstMessage
    };
  } catch (err) {
    console.error('Error loading thread from cache:', err);
    return null;
  }
}

/**
 * Sync new emails from Gmail API to Firestore cache
 * This implements incremental sync - only fetches emails modified since last sync
 */
export async function syncEmailsToCache(userId, accessToken, options = {}) {
  try {
    const { maxResults = 20, forceFullSync = false } = options;
    
    // Get last sync time
    const lastSync = forceFullSync ? null : await getLastSyncTime(userId);
    
    // Build Gmail query for incremental sync
    let gmailQuery = '';
    if (lastSync) {
      // Format date for Gmail query (YYYY/MM/DD)
      const syncDate = new Date(lastSync);
      const year = syncDate.getFullYear();
      const month = String(syncDate.getMonth() + 1).padStart(2, '0');
      const day = String(syncDate.getDate()).padStart(2, '0');
      gmailQuery = `after:${year}/${month}/${day}`;
    }
    
    console.log('Syncing emails...', gmailQuery ? `Query: ${gmailQuery}` : 'Full sync');
    
    // Fetch threads from Gmail API
    const response = await listThreads(accessToken, {
      maxResults,
      q: gmailQuery || undefined
    });
    
    if (!response.threads || response.threads.length === 0) {
      console.log('No new emails to sync');
      await updateLastSyncTime(userId);
      return { synced: 0, total: 0 };
    }
    
    // Fetch full thread details
    const threadIds = response.threads.map((t) => t.id);
    const batchSize = 10;
    const allThreads = [];
    
    for (let i = 0; i < threadIds.length; i += batchSize) {
      const batch = threadIds.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map((id) => getThread(accessToken, id).catch(() => null))
      );
      details.filter(Boolean).forEach((t) => allThreads.push(formatThread(t)));
    }
    
    // Save to Firestore cache
    await saveThreadsToCache(userId, allThreads);
    
    // Update last sync time
    await updateLastSyncTime(userId);
    
    console.log(`Synced ${allThreads.length} threads to cache`);
    
    return { synced: allThreads.length, total: response.resultSizeEstimate || allThreads.length };
  } catch (err) {
    console.error('Error syncing emails to cache:', err);
    throw err;
  }
}

/**
 * Load threads with cache-first strategy
 * 1. Load from cache immediately
 * 2. Sync new emails in background
 * 3. Return cached data while sync happens
 */
export async function loadThreadsCacheFirst(userId, accessToken, options = {}) {
  const {
    categoryFilter,
    searchQuery,
    dateFilter,
    syncInBackground = true
  } = options;
  
  // 1. Load from cache first (fast!)
  const cachedThreads = await loadThreadsFromCache(userId, {
    limitCount: 100,
    categoryFilter,
    searchQuery,
    dateFilter
  });
  
  console.log(`Loaded ${cachedThreads.length} threads from cache`);
  
  // 2. Optionally sync in background
  if (syncInBackground && accessToken) {
    // Don't await - let this happen in background
    // Use smaller batch size to avoid overwhelming Firestore
    syncEmailsToCache(userId, accessToken, { maxResults: 20 })
      .then((result) => {
        console.log(`Background sync complete: ${result.synced} new emails`);
      })
      .catch((err) => {
        console.error('Background sync failed:', err);
      });
  }
  
  return cachedThreads;
}

/**
 * Get today's emails from cache (super fast query!)
 */
export async function getTodaysEmails(userId) {
  return loadThreadsFromCache(userId, { 
    dateFilter: 'today',
    limitCount: 100 
  });
}

/**
 * Get this week's emails from cache
 */
export async function getWeeksEmails(userId) {
  return loadThreadsFromCache(userId, { 
    dateFilter: 'week',
    limitCount: 200 
  });
}

/**
 * Search messages in cache
 */
export async function searchCachedMessages(userId, searchTerm) {
  try {
    // Get all messages (we'll filter client-side for now)
    // In production, you might want to use Algolia or similar for full-text search
    const messagesRef = getUserMessagesRef(userId);
    const q = query(messagesRef, orderBy('date', 'desc'), limit(200));
    const snapshot = await getDocs(q);
    
    const messages = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        ...data,
        date: data.date?.toDate() || new Date()
      });
    });
    
    // Client-side filtering
    const searchLower = searchTerm.toLowerCase();
    const filtered = messages.filter((msg) => {
      return (
        msg.subject?.toLowerCase().includes(searchLower) ||
        msg.body?.toLowerCase().includes(searchLower) ||
        msg.from?.toLowerCase().includes(searchLower) ||
        msg.senderName?.toLowerCase().includes(searchLower)
      );
    });
    
    // Group by thread
    const threadMap = new Map();
    filtered.forEach((msg) => {
      if (!threadMap.has(msg.threadId)) {
        threadMap.set(msg.threadId, {
          id: msg.threadId,
          subject: msg.subject,
          snippet: msg.snippet,
          messages: [],
          date: msg.date
        });
      }
      threadMap.get(msg.threadId).messages.push(msg);
    });
    
    return Array.from(threadMap.values());
  } catch (err) {
    console.error('Error searching cached messages:', err);
    return [];
  }
}

/**
 * Clear all cached emails for a user (useful for debugging or sign out)
 */
export async function clearEmailCache(userId) {
  try {
    // Note: In production, you might want to use Cloud Functions for bulk deletes
    // This is a simple client-side implementation
    const threadsSnapshot = await getDocs(getUserThreadsRef(userId));
    const messagesSnapshot = await getDocs(getUserMessagesRef(userId));
    
    const batch = writeBatch(db);
    
    threadsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    messagesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    // Clear sync metadata
    await setDoc(getUserMetaRef(userId), {
      lastSyncTime: null,
      lastSyncDate: null
    });
    
    console.log('Email cache cleared');
  } catch (err) {
    console.error('Error clearing email cache:', err);
    throw err;
  }
}