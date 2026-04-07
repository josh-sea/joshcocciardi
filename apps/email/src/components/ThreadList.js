import React, { useState, useEffect, useRef } from 'react';

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
  return name.charAt(0).toUpperCase();
}

function getAvatarColor(name) {
  const colors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6', '#ff2d55', '#00c7be'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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
  hasMore,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  groupBy,
  onGroupByChange
}) {
  const [localSearch, setLocalSearch] = useState(searchQuery || '');
  const scrollContainerRef = useRef(null);
  const lastScrollTriggerRef = useRef(0);
  const scrollThrottleRef = useRef(null);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, onSearchChange]);

  // Infinite scroll handler with throttling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Clear existing throttle timer
      if (scrollThrottleRef.current) {
        clearTimeout(scrollThrottleRef.current);
      }

      // Throttle scroll events to once per 500ms
      scrollThrottleRef.current = setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
        
        // Only trigger when within 200px of bottom AND not recently triggered
        const now = Date.now();
        const timeSinceLastTrigger = now - lastScrollTriggerRef.current;
        
        if (distanceFromBottom < 200 && hasMore && !loading && timeSinceLastTrigger > 1000) {
          console.log('Loading more emails - near bottom');
          lastScrollTriggerRef.current = now;
          onLoadMore();
        }
      }, 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollThrottleRef.current) {
        clearTimeout(scrollThrottleRef.current);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  return (
    <div className="thread-list">
      <div className="thread-list-header">
        <button className="sign-out-button" onClick={onSignOut}>Sign Out</button>
        <div className="thread-list-title">Messages</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="refresh-button" 
            onClick={onRefresh}
            disabled={loading}
            title="Refresh emails"
          >
            {loading ? '...' : '↻'}
          </button>
          <button className="compose-button" onClick={onCompose}>&#9998;</button>
        </div>
      </div>

      {userEmail && (
        <div className="user-email-bar">{userEmail}</div>
      )}

      {/* Search Bar */}
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

      {/* Group By Toggle */}
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

      {/* Category Tabs */}
      <div className="category-tabs">
        <button 
          className={`category-tab ${categoryFilter === 'primary' ? 'active' : ''}`}
          onClick={() => onCategoryChange('primary')}
        >
          Primary
        </button>
        <button 
          className={`category-tab ${categoryFilter === 'promotions' ? 'active' : ''}`}
          onClick={() => onCategoryChange('promotions')}
        >
          Promotions
        </button>
        <button 
          className={`category-tab ${categoryFilter === 'social' ? 'active' : ''}`}
          onClick={() => onCategoryChange('social')}
        >
          Social
        </button>
        <button 
          className={`category-tab ${categoryFilter === 'updates' ? 'active' : ''}`}
          onClick={() => onCategoryChange('updates')}
        >
          Updates
        </button>
        <button 
          className={`category-tab ${categoryFilter === 'starred' ? 'active' : ''}`}
          onClick={() => onCategoryChange('starred')}
        >
          ⭐ Starred
        </button>
      </div>

      <div className="threads-container" ref={scrollContainerRef}>
        {loading && threads.length === 0 && (
          <div className="loading-indicator">Loading conversations...</div>
        )}

        {!loading && threads.length === 0 && (
          <div className="loading-indicator">No conversations found</div>
        )}

        {threads.map((thread) => {
          const senderName = thread.participants?.[0] || thread.subject;
          const displayName = thread.messages?.length > 1
            ? thread.subject
            : senderName;

          return (
            <div
              key={thread.id}
              className="thread-item"
              onClick={() => onOpenThread(thread)}
            >
              <div
                className="thread-avatar"
                style={{ backgroundColor: getAvatarColor(displayName) }}
              >
                {getInitial(displayName)}
              </div>
              <div className="thread-content">
                <div className="thread-header">
                  <div className="thread-name">{displayName}</div>
                  <div className="thread-time">{formatDate(thread.date)}</div>
                </div>
                <div className={`thread-preview ${thread.hasUnread ? 'unread' : ''}`}>
                  {thread.snippet}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading More Indicator */}
        {loading && threads.length > 0 && (
          <div className="loading-more">Loading more...</div>
        )}

        {/* No More Results */}
        {!loading && !hasMore && threads.length > 0 && (
          <div className="no-more-results">No more emails</div>
        )}
      </div>
    </div>
  );
}
