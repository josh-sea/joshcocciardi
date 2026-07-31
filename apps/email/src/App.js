import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import {
  initGIS,
  isGISReady,
  setTokenOwner,
  requestAuth,
  refreshAccessToken,
  revokeToken,
  loadStoredToken,
  deleteStoredToken,
  isTokenValid,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut as firebaseSignOut,
  onAuthStateChange,
} from './services/auth';
import {
  getThread,
  sendMessage,
  markAsRead,
  formatThread,
  escapeHtml,
  buildGmailQuery,
  buildReplyRecipients,
  buildReplySubject,
  buildReferences,
} from './services/gmail';
import {
  loadThreadsFromCache,
  loadThreadFromCache,
  saveThreadToCache,
  syncEmailsToCache,
  markThreadReadInCache,
  matchesCategory,
} from './services/emailCache';
import AuthScreen from './components/AuthScreen';
import GmailAuthScreen from './components/GmailAuthScreen';
import ThreadList from './components/ThreadList';
import ChatView from './components/ChatView';
import ComposeModal from './components/ComposeModal';

const VIEW = {
  AUTH: 'auth',
  GMAIL_AUTH: 'gmail_auth',
  THREADS: 'threads',
  CHAT: 'chat',
};

/** Raised when we need the user to re-authorize Gmail. */
const NEEDS_AUTH = 'NEEDS_GMAIL_AUTH';

export default function App() {
  const [view, setView] = useState(VIEW.AUTH);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [token, setToken] = useState(null);
  const [threads, setThreads] = useState([]);
  const [currentThread, setCurrentThread] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [gisReady, setGisReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('primary');
  const [hasMore, setHasMore] = useState(true);
  const [groupBy, setGroupBy] = useState('thread');
  const [composeOpen, setComposeOpen] = useState(false);

  const tokenRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const backfillTokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const bootstrappedUidRef = useRef(null);

  const userId = firebaseUser?.uid || null;
  const mailboxEmail = token?.email || '';

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // --- Google Identity Services -------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const timer = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        if (cancelled) return;
        try {
          initGIS();
          setGisReady(true);
        } catch (err) {
          setError(err.message);
        }
      } else if (attempts >= 50) {
        clearInterval(timer);
        if (!cancelled) {
          setError('Failed to load Google Identity Services. Check your network.');
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // --- Firebase session ----------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setFirebaseUser(user);
      setTokenOwner(user?.uid || null);

      if (!user) {
        bootstrappedUidRef.current = null;
        setToken(null);
        setThreads([]);
        setCurrentThread(null);
        setView(VIEW.AUTH);
      }
    });

    return () => unsubscribe();
  }, []);

  /**
   * Once we have both a Firebase user and a ready GIS client, find a usable
   * Gmail token: the stored one if it's still good, otherwise a silent
   * refresh, and only then fall back to asking for consent.
   */
  useEffect(() => {
    if (!userId || !gisReady) return;
    if (bootstrappedUidRef.current === userId) return;
    bootstrappedUidRef.current = userId;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const stored = await loadStoredToken(userId);
        if (cancelled) return;

        if (stored && isTokenValid(stored)) {
          setToken(stored);
          setView(VIEW.THREADS);
          return;
        }

        // An expired token still means consent was granted before, so a
        // silent refresh usually succeeds and spares the user a prompt.
        try {
          const fresh = await refreshAccessToken();
          if (cancelled) return;
          setToken(fresh);
          setView(VIEW.THREADS);
        } catch {
          if (cancelled) return;
          setToken(null);
          setView(VIEW.GMAIL_AUTH);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading Gmail token:', err);
          setError('Failed to load Gmail access. Please authorize.');
          setView(VIEW.GMAIL_AUTH);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, gisReady]);

  // --- Token lifecycle -----------------------------------------------------

  const refreshTokenNow = useCallback(async () => {
    try {
      const fresh = await refreshAccessToken();
      tokenRef.current = fresh;
      setToken(fresh);
      return fresh;
    } catch (err) {
      console.error('Silent token refresh failed:', err);
      setView(VIEW.GMAIL_AUTH);
      setError('Your Gmail session expired. Please authorize again.');
      const authError = new Error(NEEDS_AUTH);
      authError.code = NEEDS_AUTH;
      throw authError;
    }
  }, []);

  /**
   * Run a Gmail call with a valid access token, refreshing once if the token
   * turns out to be expired mid-flight.
   */
  const withGmail = useCallback(
    async (fn) => {
      let current = tokenRef.current;
      if (!current?.access_token) {
        const authError = new Error(NEEDS_AUTH);
        authError.code = NEEDS_AUTH;
        throw authError;
      }

      if (!isTokenValid(current)) {
        current = await refreshTokenNow();
      }

      try {
        return await fn(current.access_token);
      } catch (err) {
        if (err.message !== 'TOKEN_EXPIRED') throw err;
        const refreshed = await refreshTokenNow();
        return fn(refreshed.access_token);
      }
    },
    [refreshTokenNow]
  );

  // Refresh quietly five minutes before expiry. Unlike the old flow this no
  // longer changes the view, so a refresh can't yank you out of a thread.
  useEffect(() => {
    if (!token?.expires_at) return undefined;

    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const msUntilRefresh = token.expires_at - Date.now() - 5 * 60 * 1000;
    if (msUntilRefresh > 0) {
      refreshTimerRef.current = setTimeout(() => {
        refreshTokenNow().catch(() => {});
      }, msUntilRefresh);
    }

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [token?.expires_at, refreshTokenNow]);

  // --- Loading threads -----------------------------------------------------

  const reportError = useCallback((err, fallback) => {
    if (err?.code === NEEDS_AUTH || err?.message === NEEDS_AUTH) return;
    if (err?.message === 'RATE_LIMITED') {
      setError('Gmail is rate limiting us. Give it a moment, then refresh.');
      return;
    }
    setError(`${fallback}: ${err?.message || 'unknown error'}`);
  }, []);

  const loadThreads = useCallback(async () => {
    if (!userId || !tokenRef.current?.access_token) return;

    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    backfillTokenRef.current = null;
    setHasMore(true);
    setLoading(true);

    // 1. Show whatever the cache already has, immediately.
    const cached = await loadThreadsFromCache(userId, { categoryFilter, searchQuery });
    if (isStale()) return;
    if (searchQuery) {
      // A search is only meaningful once Gmail has answered it.
      setThreads([]);
    } else {
      setThreads(cached);
      setLoading(false);
    }

    // 2. Then sync with Gmail and show the result — the step the old flow
    //    kicked off and never waited for, which is why a first load looked
    //    like an empty mailbox.
    setSyncing(true);
    try {
      const incremental = cached.length > 0 && !searchQuery;
      const result = await withGmail((accessToken) =>
        syncEmailsToCache(userId, accessToken, {
          query: buildGmailQuery(searchQuery, categoryFilter),
          incremental,
          syncKey: `${categoryFilter || 'all'}`,
          maxResults: 25,
        })
      );
      if (isStale()) return;

      if (!incremental) {
        backfillTokenRef.current = result.nextPageToken;
        setHasMore(Boolean(result.nextPageToken));
      }

      if (searchQuery) {
        // Search is answered by Gmail, not by a local scan — operators like
        // `from:` or `has:attachment` can only be evaluated server-side.
        setThreads(result.threads.filter((t) => matchesCategory(t, categoryFilter)));
      } else {
        const refreshed = await loadThreadsFromCache(userId, {
          categoryFilter,
          searchQuery,
        });
        if (isStale()) return;
        setThreads(refreshed);
      }
    } catch (err) {
      if (!isStale()) reportError(err, 'Failed to load threads');
    } finally {
      if (!isStale()) {
        setSyncing(false);
        setLoading(false);
      }
    }
  }, [userId, categoryFilter, searchQuery, withGmail, reportError]);

  const loadMoreThreads = useCallback(async () => {
    if (!userId || syncing || !hasMore) return;

    const requestId = requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    setSyncing(true);
    try {
      const result = await withGmail((accessToken) =>
        syncEmailsToCache(userId, accessToken, {
          query: buildGmailQuery(searchQuery, categoryFilter),
          pageToken: backfillTokenRef.current,
          incremental: false,
          syncKey: `${categoryFilter || 'all'}`,
          maxResults: 25,
        })
      );
      if (isStale()) return;

      backfillTokenRef.current = result.nextPageToken;
      setHasMore(Boolean(result.nextPageToken));

      if (searchQuery) {
        const additions = result.threads.filter((t) => matchesCategory(t, categoryFilter));
        setThreads((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          return [...prev, ...additions.filter((t) => !seen.has(t.id))];
        });
      } else {
        const refreshed = await loadThreadsFromCache(userId, {
          categoryFilter,
          searchQuery,
          limitCount: 300,
        });
        if (isStale()) return;
        setThreads(refreshed);
      }
    } catch (err) {
      if (!isStale()) reportError(err, 'Failed to load more');
    } finally {
      if (!isStale()) setSyncing(false);
    }
  }, [userId, syncing, hasMore, searchQuery, categoryFilter, withGmail, reportError]);

  // `loadThreads` changes identity when the user, tab or search changes,
  // which is exactly when the list should be rebuilt.
  const threadsViewActive = view === VIEW.THREADS;
  useEffect(() => {
    if (!threadsViewActive) return;
    loadThreads();
  }, [threadsViewActive, loadThreads]);

  // --- Auth actions --------------------------------------------------------

  const handleEmailSignIn = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const handleEmailSignUp = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorizeGmail = async () => {
    if (!isGISReady()) {
      setError('Google Identity Services not ready yet.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fresh = await requestAuth();
      setToken(fresh);
      setView(VIEW.THREADS);
    } catch (err) {
      setError(err.message || 'Authorization failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const current = tokenRef.current;
    if (current?.access_token) revokeToken(current.access_token);
    if (userId) await deleteStoredToken(userId);

    bootstrappedUidRef.current = null;
    setToken(null);
    setThreads([]);
    setCurrentThread(null);
    setError(null);
    await firebaseSignOut();
  };

  // --- Threads -------------------------------------------------------------

  const markThreadRead = useCallback(
    async (thread) => {
      const unreadIds = (thread.messages || []).filter((m) => m.isUnread).map((m) => m.id);
      if (!unreadIds.length || !userId) return;

      for (const id of unreadIds) {
        try {
          await withGmail((accessToken) => markAsRead(accessToken, id));
        } catch {
          // Read receipts are best-effort.
        }
      }

      await markThreadReadInCache(userId, thread.id, unreadIds);
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, hasUnread: false } : t))
      );
      setCurrentThread((prev) =>
        prev && prev.id === thread.id
          ? { ...prev, hasUnread: false, messages: prev.messages.map((m) => ({ ...m, isUnread: false })) }
          : prev
      );
    },
    [userId, withGmail]
  );

  const handleOpenThread = useCallback(
    async (thread) => {
      setView(VIEW.CHAT);
      setCurrentThread({ ...thread, messages: thread.messages || [] });

      try {
        let full = userId ? await loadThreadFromCache(userId, thread.id) : null;

        // List rows carry no message bodies, so anything not already cached
        // in full has to come from Gmail before it can be displayed.
        if (!full?.messages?.length) {
          const fetched = await withGmail((accessToken) => getThread(accessToken, thread.id));
          full = formatThread(fetched);
          if (userId) await saveThreadToCache(userId, full).catch(console.error);
        }

        setCurrentThread(full);
        markThreadRead(full);
      } catch (err) {
        reportError(err, 'Failed to open conversation');
      }
    },
    [userId, withGmail, markThreadRead, reportError]
  );

  const handleBack = () => {
    setCurrentThread(null);
    setView(VIEW.THREADS);
  };

  const refreshThreadAfterSend = useCallback(
    async (threadId) => {
      try {
        const updated = await withGmail((accessToken) => getThread(accessToken, threadId));
        const formatted = formatThread(updated);
        setCurrentThread(formatted);
        if (userId) await saveThreadToCache(userId, formatted).catch(console.error);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === formatted.id
              ? { ...t, snippet: formatted.snippet, date: formatted.date, hasUnread: false }
              : t
          )
        );
      } catch {
        // The message went out; refreshing the view is a nicety.
      }
    },
    [userId, withGmail]
  );

  const handleSendReply = useCallback(
    async (text, { replyAll = false } = {}) => {
      if (!currentThread?.messages?.length) {
        throw new Error('This conversation has no message to reply to yet.');
      }

      const last = currentThread.messages[currentThread.messages.length - 1];
      const { to, cc } = buildReplyRecipients(currentThread, mailboxEmail, { replyAll });

      await withGmail((accessToken) =>
        sendMessage(accessToken, {
          to,
          cc,
          subject: buildReplySubject(currentThread),
          body: escapeHtml(text).replace(/\r?\n/g, '<br>'),
          threadId: currentThread.id,
          inReplyTo: last?.messageId,
          references: buildReferences(last),
        })
      );

      await refreshThreadAfterSend(currentThread.id);
    },
    [currentThread, mailboxEmail, withGmail, refreshThreadAfterSend]
  );

  const handleComposeSend = useCallback(
    async ({ to, cc, subject, body }) => {
      await withGmail((accessToken) =>
        sendMessage(accessToken, {
          to,
          cc,
          subject,
          body: escapeHtml(body).replace(/\r?\n/g, '<br>'),
        })
      );
    },
    [withGmail]
  );

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
          threads={threads}
          onOpenThread={handleOpenThread}
          onCompose={() => setComposeOpen(true)}
          onSignOut={handleSignOut}
          onRefresh={loadThreads}
          onLoadMore={loadMoreThreads}
          userEmail={mailboxEmail}
          loading={loading}
          syncing={syncing}
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
          userEmail={mailboxEmail}
          accessToken={token?.access_token}
          onBack={handleBack}
          onSend={handleSendReply}
          onOpenCompose={() => setComposeOpen(true)}
        />
      )}

      {composeOpen && (
        <ComposeModal onClose={() => setComposeOpen(false)} onSend={handleComposeSend} />
      )}
    </>
  );
}
