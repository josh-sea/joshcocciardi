import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { 
  initGIS, 
  requestAuth, 
  refreshAccessToken, 
  revokeToken,
  loadStoredToken,
  isTokenValid,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut as firebaseSignOut,
  onAuthStateChange
} from './services/auth';
import { listThreads, getThread, sendMessage, markAsRead, formatThread } from './services/gmail';
import { 
  loadThreadsCacheFirst, 
  loadThreadFromCache, 
  syncEmailsToCache,
  saveThreadToCache,
  getTodaysEmails,
  getWeeksEmails
} from './services/emailCache';
import AuthScreen from './components/AuthScreen';
import GmailAuthScreen from './components/GmailAuthScreen';
import ThreadList from './components/ThreadList';
import ChatView from './components/ChatView';

const VIEW = {
  AUTH: 'auth',
  GMAIL_AUTH: 'gmail_auth',
  THREADS: 'threads',
  CHAT: 'chat',
};

export default function App() {
  const [view, setView] = useState(VIEW.AUTH);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [token, setToken] = useState(null);
  const [threads, setThreads] = useState([]);
  const [currentThread, setCurrentThread] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gisReady, setGisReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('primary');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [groupBy, setGroupBy] = useState('thread'); // 'thread' or 'sender'

  const refreshTimerRef = useRef(null);
  const lastFetchTimeRef = useRef(0);
  const fetchInProgressRef = useRef(false);
  const FETCH_COOLDOWN = 2000; // 2 seconds minimum between fetches

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setFirebaseUser(user);
      
      if (user) {
        // User is signed into Firebase, load their Gmail token
        setLoading(true);
        try {
          const storedToken = await loadStoredToken(user.email);
          
          if (storedToken && isTokenValid(storedToken)) {
            // Valid token found
            setToken(storedToken);
            setView(VIEW.THREADS);
            setError(null);
          } else {
            // No token or expired token - show Gmail auth screen
            setView(VIEW.GMAIL_AUTH);
            setError(null);
          }
        } catch (err) {
          console.error('Error loading Gmail token:', err);
          setError('Failed to load Gmail access. Please authorize.');
        } finally {
          setLoading(false);
        }
      } else {
        // User signed out
        setToken(null);
        setView(VIEW.AUTH);
      }
    });

    return () => unsubscribe();
  }, []);

  // Wait for the GIS script to load, then initialize
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds

    const checkGIS = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.oauth2) {
        clearInterval(checkGIS);
        initGIS(
          (tokenData) => {
            setToken(tokenData);
            setView(VIEW.THREADS);
            setError(null);
          },
          (err) => {
            console.error('Auth error:', err);
            setError('Authentication failed. Please try again.');
            setLoading(false);
          }
        );
        setGisReady(true);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkGIS);
        setError('Failed to load Google Identity Services. Check your network.');
      }
    }, 100);

    return () => clearInterval(checkGIS);
  }, []);

  // Schedule silent token refresh before expiry
  useEffect(() => {
    if (!token?.expires_at) return;

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Refresh 5 minutes before expiry
    const msUntilRefresh = token.expires_at - Date.now() - 5 * 60 * 1000;

    if (msUntilRefresh > 0) {
      refreshTimerRef.current = setTimeout(() => {
        refreshAccessToken();
      }, msUntilRefresh);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [token?.expires_at]);

  const handleTokenExpired = useCallback(() => {
    setError('Session expired. Refreshing...');
    try {
      refreshAccessToken();
    } catch {
      setView(VIEW.AUTH);
      setToken(null);
      setError('Session expired. Please sign in again.');
    }
  }, []);

  // Fetch threads with cache-first strategy
  const fetchThreads = useCallback(async (append = false, forceSync = false) => {
    if (!token?.access_token || !firebaseUser?.uid) return;

    // Prevent overlapping fetches
    if (fetchInProgressRef.current) {
      console.log('Fetch already in progress, skipping');
      return;
    }

    // Prevent rapid successive fetches (rate limiting)
    const now = Date.now();
    if (!append && !forceSync && now - lastFetchTimeRef.current < FETCH_COOLDOWN) {
      console.log('Fetch cooldown active, skipping fetch');
      return;
    }
    lastFetchTimeRef.current = now;
    fetchInProgressRef.current = true;

    setLoading(true);
    try {
      if (!append) {
        // CACHE-FIRST STRATEGY: Load from cache immediately
        console.log('Loading threads from cache...');
        const cachedThreads = await loadThreadsCacheFirst(
          firebaseUser.uid,
          token.access_token,
          {
            categoryFilter,
            searchQuery,
            syncInBackground: !forceSync // Only sync in background if not forcing a full sync
          }
        );

        // Display cached threads immediately
        setThreads(cachedThreads);
        setHasMore(cachedThreads.length >= 50); // Assume more if we got many results
        
      } else {
        // For pagination, still use Gmail API directly
        // (In future, could implement pagination in cache)
        const query = buildGmailQuery(searchQuery, categoryFilter);
        
        const res = await listThreads(token.access_token, { 
          maxResults: 50,
          pageToken: nextPageToken,
          q: query || undefined
        });

        if (!res.threads?.length) {
          setHasMore(false);
          setLoading(false);
          return;
        }

        setNextPageToken(res.nextPageToken || null);
        setHasMore(!!res.nextPageToken);

        // Fetch and cache thread details
        const threadIds = res.threads.map((t) => t.id);
        const batchSize = 10;
        const allFormatted = [];

        for (let i = 0; i < threadIds.length; i += batchSize) {
          const batch = threadIds.slice(i, i + batchSize);
          const details = await Promise.all(
            batch.map((id) => getThread(token.access_token, id).catch(() => null))
          );
          const formatted = details.filter(Boolean).map((t) => formatThread(t));
          
          // Save to cache
          for (const thread of formatted) {
            await saveThreadToCache(firebaseUser.uid, thread).catch(console.error);
          }
          
          allFormatted.push(...formatted);
        }

        allFormatted.sort((a, b) => b.date - a.date);
        setThreads((prev) => [...prev, ...allFormatted]);
      }
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') {
        handleTokenExpired();
      } else if (err.message.includes('rateLimitExceeded') || err.message.includes('Quota exceeded')) {
        setError('Rate limit exceeded. Please wait a moment before refreshing.');
        lastFetchTimeRef.current = Date.now() + 30000; // 30 second cooldown
      } else {
        setError('Failed to load threads: ' + err.message);
      }
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [token?.access_token, firebaseUser?.uid, handleTokenExpired, searchQuery, categoryFilter, nextPageToken]);

  // Helper function to build Gmail query
  function buildGmailQuery(search, category) {
    let query = search;
    
    if (category === 'starred') {
      query = query ? `${query} is:starred` : 'is:starred';
    } else if (category === 'primary') {
      query = query ? `${query} category:primary` : 'category:primary';
    } else if (category === 'promotions') {
      query = query ? `${query} category:promotions` : 'category:promotions';
    } else if (category === 'social') {
      query = query ? `${query} category:social` : 'category:social';
    } else if (category === 'updates') {
      query = query ? `${query} category:updates` : 'category:updates';
    }
    
    return query;
  }

  // Load more threads
  const loadMoreThreads = useCallback(() => {
    if (!loading && hasMore && nextPageToken) {
      fetchThreads(true);
    }
  }, [loading, hasMore, nextPageToken, fetchThreads]);

  useEffect(() => {
    if (view === VIEW.THREADS && token?.access_token) {
      // Reset pagination when search or category changes
      setNextPageToken(null);
      setHasMore(true);
      fetchThreads(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, token?.access_token, searchQuery, categoryFilter]);

  // Handle email/password sign in
  const handleEmailSignIn = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      // onAuthStateChange will handle loading the Gmail token
    } catch (err) {
      setError(err.message || 'Sign in failed');
      setLoading(false);
      throw err;
    }
  };

  // Handle email/password sign up
  const handleEmailSignUp = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password);
      // After sign up, they'll need to authorize Gmail
      setError('Account created! Now please authorize Gmail access.');
    } catch (err) {
      setError(err.message || 'Sign up failed');
      setLoading(false);
      throw err;
    }
  };

  // Handle Google sign in (Firebase, not Gmail OAuth)
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // onAuthStateChange will handle loading the Gmail token
    } catch (err) {
      setError(err.message || 'Google sign in failed');
      setLoading(false);
    }
  };

  // Handle Gmail OAuth (only when needed)
  const handleAuthorizeGmail = () => {
    if (!gisReady) {
      setError('Google Identity Services not ready yet.');
      return;
    }
    if (!firebaseUser) {
      setError('Please sign in first.');
      return;
    }
    setLoading(true);
    setError(null);
    requestAuth();
  };

  const handleSignOut = async () => {
    if (token?.access_token) {
      revokeToken(token.access_token);
    }
    setToken(null);
    setThreads([]);
    setCurrentThread(null);
    setError(null);
    await firebaseSignOut();
  };

  const handleOpenThread = async (thread) => {
    // Try to load from cache first for instant display
    if (firebaseUser?.uid && thread.id) {
      const cachedThread = await loadThreadFromCache(firebaseUser.uid, thread.id);
      if (cachedThread && cachedThread.messages?.length > 0) {
        setCurrentThread(cachedThread);
        setView(VIEW.CHAT);
        
        // Mark unread messages as read
        if (token?.access_token) {
          const unreadMessages = cachedThread.messages.filter((m) => m.isUnread);
          for (const msg of unreadMessages) {
            try {
              await markAsRead(token.access_token, msg.id);
            } catch {
              // Silently fail for read receipts
            }
          }
        }
        return;
      }
    }
    
    // Fallback: use the thread data we already have
    setCurrentThread(thread);
    setView(VIEW.CHAT);

    // Mark unread messages as read
    if (token?.access_token && thread.messages) {
      const unreadMessages = thread.messages.filter((m) => m.isUnread);
      for (const msg of unreadMessages) {
        try {
          await markAsRead(token.access_token, msg.id);
        } catch {
          // Silently fail for read receipts
        }
      }
    }
  };

  const handleBack = () => {
    setCurrentThread(null);
    setView(VIEW.THREADS);
  };

  const handleSendReply = async (text) => {
    if (!currentThread || !token?.access_token) return;

    const lastMsg = currentThread.messages[currentThread.messages.length - 1];
    const replyTo = lastMsg?.senderEmail || lastMsg?.from;
    const subject = currentThread.subject?.startsWith('Re:')
      ? currentThread.subject
      : `Re: ${currentThread.subject}`;

    await sendMessage(token.access_token, {
      to: replyTo,
      subject,
      body: text.replace(/\n/g, '<br>'),
      threadId: currentThread.id,
      inReplyTo: lastMsg?.messageId,
      references: lastMsg?.messageId,
    });

    // Refresh the thread to show the sent message
    try {
      const updated = await getThread(token.access_token, currentThread.id);
      const formatted = formatThread(updated);
      setCurrentThread(formatted);

      // Save updated thread to cache
      if (firebaseUser?.uid) {
        await saveThreadToCache(firebaseUser.uid, formatted).catch(console.error);
      }

      // Update in the threads list too
      setThreads((prev) =>
        prev.map((t) => (t.id === formatted.id ? formatted : t))
      );
    } catch {
      // At minimum the message was sent
    }
  };

  const handleCompose = () => {
    // TODO: Implement compose new email flow
    alert('Compose feature coming soon');
  };

  // Group threads by sender
  const groupThreadsBySender = useCallback((threadList) => {
    const senderMap = new Map();
    
    threadList.forEach((thread) => {
      // Get the sender email from the first message (usually the one who started the thread)
      const senderEmail = thread.participants?.[0] || thread.senderEmail || 'unknown';
      
      if (!senderMap.has(senderEmail)) {
        senderMap.set(senderEmail, {
          id: `sender-${senderEmail}`,
          senderEmail: senderEmail,
          subject: thread.participants?.[0] || senderEmail,
          participants: [senderEmail],
          messages: [],
          snippet: '',
          date: thread.date,
          hasUnread: false,
          isSenderGroup: true, // Flag to identify sender-grouped threads
          originalThreadIds: []
        });
      }
      
      const senderGroup = senderMap.get(senderEmail);
      
      // Add all messages from this thread to the sender group
      if (thread.messages) {
        senderGroup.messages.push(...thread.messages);
      }
      
      // Track original thread IDs
      senderGroup.originalThreadIds.push(thread.id);
      
      // Update snippet to most recent message
      if (thread.date > senderGroup.date) {
        senderGroup.date = thread.date;
        senderGroup.snippet = thread.snippet;
      }
      
      // Update unread status
      if (thread.hasUnread) {
        senderGroup.hasUnread = true;
      }
    });
    
    // Convert map to array and sort by date
    const grouped = Array.from(senderMap.values());
    grouped.forEach(group => {
      // Sort messages within each group by date
      group.messages.sort((a, b) => (a.date || 0) - (b.date || 0));
    });
    grouped.sort((a, b) => b.date - a.date);
    
    return grouped;
  }, []);

  // Get display threads based on groupBy mode
  const displayThreads = groupBy === 'sender' ? groupThreadsBySender(threads) : threads;

  return (
    <>
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error} (tap to dismiss)
        </div>
      )}

      {view === VIEW.AUTH && (
        <AuthScreen 
          onEmailSignIn={handleEmailSignIn}
          onEmailSignUp={handleEmailSignUp}
          onGoogleSignIn={handleGoogleSignIn}
          loading={loading} 
        />
      )}

      {view === VIEW.GMAIL_AUTH && (
        <GmailAuthScreen
          userEmail={firebaseUser?.email}
          onAuthorizeGmail={handleAuthorizeGmail}
          onSignOut={handleSignOut}
          loading={loading}
        />
      )}

      {view === VIEW.THREADS && (
        <ThreadList
          threads={displayThreads}
          onOpenThread={handleOpenThread}
          onCompose={handleCompose}
          onSignOut={handleSignOut}
          onRefresh={() => fetchThreads(false)}
          onLoadMore={loadMoreThreads}
          userEmail={token?.email}
          loading={loading}
          hasMore={hasMore}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      )}

      {view === VIEW.CHAT && (
        <ChatView
          thread={currentThread}
          userEmail={token?.email}
          accessToken={token?.access_token}
          onBack={handleBack}
          onSend={handleSendReply}
        />
      )}
    </>
  );
}
