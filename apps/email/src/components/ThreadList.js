import React, { useState, useEffect, useRef, useMemo } from 'react';

const CATEGORIES = [
  { key: 'primary', label: 'Primary' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'social', label: 'Social' },
  { key: 'updates', label: 'Updates' },
  { key: 'starred', label: '⭐ Starred' },
];

function formatDate(date) {
  if (!date || isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = now - date;
  const oneDay = 86400000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  if (diff < 7 * oneDay) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitial(name) {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase() || '?';
}

function getAvatarColor(name) {
  const colors = [
    '#007aff', '#34c759', '#ff9500', '#ff3b30',
    '#af52de', '#5856d6', '#ff2d55', '#00c7be',
  ];
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * The name to show on a thread row: whoever is on the other end of it.
 * Falls back through the cached fields so rows loaded straight from
 * Firestore — which carry no `messages` array — still read correctly.
 */
function threadDisplayName(thread) {
  if (thread.participants?.length > 1) {
    return thread.participants.join(', ');
  }
  return (
    thread.participants?.[0] ||
    thread.lastSenderName ||
    thread.lastSenderEmail ||
    '(unknown sender)'
  );
}

function ThreadRow({ thread, onOpenThread }) {
  const name = threadDisplayName(thread);
  const subject = thread.subject || '(no subject)';

  return (
    <div className="thread-item" onClick={() => onOpenThread(thread)}>
      <div className="thread-avatar" style={{ backgroundColor: getAvatarColor(name) }}>
        {getInitial(name)}
      </div>
      <div className="thread-content">
        <div className="thread-header">
          <div className={`thread-name ${thread.hasUnread ? 'unread' : ''}`}>{name}</div>
          <div className="thread-time">{formatDate(thread.date)}</div>
        </div>
        <div className={`thread-subject ${thread.hasUnread ? 'unread' : ''}`}>
          {thread.hasUnread && <span className="unread-dot" />}
          {subject}
        </div>
        <div className="thread-preview">{thread.snippet}</div>
      </div>
    </div>
  );
}

export default function ThreadList({
  threads,
  onOpenThread,
  onCompose,
  onSignOut,
  onRefresh,
  onLoadMore,
  userEmail,
  loading,
  syncing,
  hasMore,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  groupBy,
  onGroupByChange,
}) {
  const [localSearch, setLocalSearch] = useState(searchQuery || '');
  const scrollContainerRef = useRef(null);
  const lastScrollTriggerRef = useRef(0);
  const scrollThrottleRef = useRef(null);

  // Keep the input in step when the query is cleared from outside.
  useEffect(() => {
    setLocalSearch((current) => (current === searchQuery ? current : searchQuery || ''));
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, onSearchChange]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollThrottleRef.current) clearTimeout(scrollThrottleRef.current);

      scrollThrottleRef.current = setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
        const now = Date.now();

        if (
          distanceFromBottom < 400 &&
          hasMore &&
          !loading &&
          !syncing &&
          now - lastScrollTriggerRef.current > 1000
        ) {
          lastScrollTriggerRef.current = now;
          onLoadMore();
        }
      }, 200);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollThrottleRef.current) clearTimeout(scrollThrottleRef.current);
    };
  }, [hasMore, loading, syncing, onLoadMore]);

  /**
   * "By sender" groups the *list* into sections. Rows stay real threads, so
   * opening one still opens a thread Gmail knows about.
   */
  const sections = useMemo(() => {
    if (groupBy !== 'sender') {
      return [{ key: '__all__', label: null, threads }];
    }

    const bySender = new Map();
    threads.forEach((thread) => {
      const key = (thread.lastSenderEmail || thread.participants?.[0] || 'unknown').toLowerCase();
      if (!bySender.has(key)) {
        bySender.set(key, {
          key,
          label: thread.lastSenderName || thread.lastSenderEmail || 'Unknown sender',
          threads: [],
          latest: thread.date,
        });
      }
      const group = bySender.get(key);
      group.threads.push(thread);
      if (thread.date > group.latest) group.latest = thread.date;
    });

    return Array.from(bySender.values()).sort((a, b) => b.latest - a.latest);
  }, [threads, groupBy]);

  const isEmpty = !loading && threads.length === 0;

  return (
    <div className="thread-list">
      <div className="thread-list-header">
        <button className="sign-out-button" onClick={onSignOut}>
          Sign Out
        </button>
        <div className="thread-list-title">Messages</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="refresh-button"
            onClick={onRefresh}
            disabled={loading || syncing}
            title="Refresh emails"
          >
            {syncing || loading ? '...' : '↻'}
          </button>
          <button className="compose-button" onClick={onCompose} title="New message">
            &#9998;
          </button>
        </div>
      </div>

      {userEmail && <div className="user-email-bar">{userEmail}</div>}

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search emails..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="search-input"
        />
        {localSearch && (
          <button
            className="clear-search"
            onClick={() => {
              setLocalSearch('');
              onSearchChange('');
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="group-by-toggle">
        <button
          className={`group-toggle-btn ${groupBy === 'thread' ? 'active' : ''}`}
          onClick={() => onGroupByChange('thread')}
        >
          By Thread
        </button>
        <button
          className={`group-toggle-btn ${groupBy === 'sender' ? 'active' : ''}`}
          onClick={() => onGroupByChange('sender')}
        >
          By Sender
        </button>
      </div>

      <div className="category-tabs">
        {CATEGORIES.map((category) => (
          <button
            key={category.key}
            className={`category-tab ${categoryFilter === category.key ? 'active' : ''}`}
            onClick={() => onCategoryChange(category.key)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {syncing && <div className="sync-indicator">Checking for new mail…</div>}

      <div className="threads-container" ref={scrollContainerRef}>
        {loading && threads.length === 0 && (
          <div className="loading-indicator">Loading conversations...</div>
        )}

        {isEmpty && (
          <div className="loading-indicator">
            {searchQuery
              ? 'No conversations match that search'
              : syncing
              ? 'Fetching your mail…'
              : 'No conversations found'}
          </div>
        )}

        {sections.map((section) => (
          <React.Fragment key={section.key}>
            {section.label && <div className="sender-group-header">{section.label}</div>}
            {section.threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} onOpenThread={onOpenThread} />
            ))}
          </React.Fragment>
        ))}

        {(loading || syncing) && threads.length > 0 && (
          <div className="loading-more">Loading more...</div>
        )}

        {!loading && !syncing && !hasMore && threads.length > 0 && (
          <div className="no-more-results">No more emails</div>
        )}
      </div>
    </div>
  );
}
