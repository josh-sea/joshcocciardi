import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { downloadAttachment, splitQuotedText } from '../services/gmail';
import MessageBody from './MessageBody';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(parseInt(dateStr, 10));
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateDivider(dateStr) {
  if (!dateStr) return '';
  const date = new Date(parseInt(dateStr, 10));
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = now - date;
  const oneDay = 86400000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    return 'Today';
  }
  if (diff < 2 * oneDay) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Heuristic used only to decide whether to offer the "display images" banner.
 * Blocking itself is enforced by the renderer's CSP, so a miss here costs a
 * banner, never a leaked tracking pixel.
 */
function hasImages(html) {
  return /<img[\s>]|srcset=|background-image\s*:/i.test(html || '');
}

function AttachmentList({ attachments, messageId, onDownload }) {
  if (!attachments || attachments.length === 0) return null;

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="attachments-container">
      {attachments.map((att, idx) => (
        <div key={idx} className="attachment-item">
          <span className="attachment-icon">📎</span>
          <div className="attachment-info">
            <div className="attachment-name">{att.filename}</div>
            <div className="attachment-size">{formatSize(att.size)}</div>
          </div>
          <button className="attachment-download" onClick={() => onDownload(messageId, att)}>
            Download
          </button>
        </div>
      ))}
    </div>
  );
}

function ImageBanner({ className, onShow, onAlwaysShow }) {
  return (
    <div className={className}>
      <span>Images are hidden for your privacy</span>
      <div className="image-banner-actions">
        <button className="load-images-btn" onClick={onShow}>
          Display images
        </button>
        <button className="always-load-btn" onClick={onAlwaysShow}>
          Always display
        </button>
      </div>
    </div>
  );
}

export default function ChatView({
  thread,
  userEmail,
  accessToken,
  onBack,
  onSend,
  onOpenCompose,
}) {
  const [replyText, setReplyText] = useState('');
  const [replyAll, setReplyAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [expandedMessageId, setExpandedMessageId] = useState(null);
  const [loadedImages, setLoadedImages] = useState(() => new Set());
  const [alwaysLoadImages, setAlwaysLoadImages] = useState(false);
  const [expandedQuotes, setExpandedQuotes] = useState(() => new Set());
  const messagesContainerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef(null);

  const messages = useMemo(
    () =>
      [...(thread?.messages || [])].sort((a, b) => {
        const aDate = parseInt(a.internalDate || 0, 10);
        const bDate = parseInt(b.internalDate || 0, 10);
        return aDate - bDate;
      }),
    [thread?.messages]
  );

  /**
   * Scroll the message list, and only the message list.
   *
   * `scrollIntoView` scrolls every scrollable ancestor, the document
   * included — which on iOS slides the whole layout up and takes the header
   * (and its back button) off the top of the screen.
   */
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /**
   * Message bodies are iframes that report their height after they render,
   * so the list keeps growing for a moment after it first paints. Stay
   * pinned to the bottom while that settles — but stop the moment the
   * reader scrolls up, so we never yank them away from what they're reading.
   */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - (container.scrollTop + container.clientHeight);
      stickToBottomRef.current = distanceFromBottom < 40;
    };

    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollToBottom();
    });
    observer.observe(container);
    Array.from(container.children).forEach((child) => observer.observe(child));

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', onScroll);
    };
  }, [messages, scrollToBottom]);

  useEffect(() => {
    setLoadedImages(new Set());
    setExpandedQuotes(new Set());
    setExpandedMessageId(null);
    setSendError(null);
  }, [thread?.id]);

  const handleLoadImages = useCallback((messageId) => {
    setLoadedImages((prev) => new Set([...prev, messageId]));
  }, []);

  const handleAlwaysLoadImages = useCallback(() => {
    setAlwaysLoadImages(true);
  }, []);

  const toggleQuote = useCallback((messageId) => {
    setExpandedQuotes((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const handleDownloadAttachment = useCallback(
    async (messageId, attachment) => {
      try {
        const bytes = await downloadAttachment(accessToken, messageId, attachment.attachmentId);
        const blob = new Blob([bytes], { type: attachment.mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.filename;
        a.click();
        // Revoked on the next tick so the click has a chance to start.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) {
        console.error('Failed to download attachment:', err);
        setSendError('Could not download that attachment. Please try again.');
      }
    },
    [accessToken]
  );

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await onSend(replyText.trim(), { replyAll });
      setReplyText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Failed to send:', err);
      setSendError(err.message || 'Could not send your reply.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setReplyText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  };

  const expandedMessage = useMemo(
    () => messages.find((m) => m.id === expandedMessageId) || null,
    [messages, expandedMessageId]
  );

  if (!thread) return null;

  const subject = thread.subject || '(no subject)';
  const participantCount = thread.participantCount || 1;
  const mine = (userEmail || '').toLowerCase();

  let lastDate = '';

  return (
    <div className="chat-view active">
      <div className="chat-header">
        <button className="back-button" onClick={onBack}>
          &larr; Messages
        </button>
        <div className="chat-title-container">
          <div className="chat-title">{subject}</div>
          {participantCount > 1 && (
            <div className="chat-subtitle">{participantCount} participants</div>
          )}
        </div>
        <button className="compose-button" onClick={onOpenCompose} title="New message">
          &#9998;
        </button>
      </div>

      <div className="messages-container" ref={messagesContainerRef}>
        {messages.map((msg) => {
          const isSent = Boolean(mine) && (msg.senderEmail || '').toLowerCase() === mine;
          const messageDate = formatDateDivider(msg.internalDate);
          let dateDivider = null;

          if (messageDate && messageDate !== lastDate) {
            lastDate = messageDate;
            dateDivider = (
              <div className="date-divider">
                <span>{messageDate}</span>
              </div>
            );
          }

          const fullHtml = msg.body || msg.snippet || '';
          const { visible, quoted } = splitQuotedText(fullHtml);
          const quoteShown = expandedQuotes.has(msg.id);
          const shownHtml = quoteShown ? fullHtml : visible;

          const imagesLoaded = alwaysLoadImages || loadedImages.has(msg.id);
          const showBanner = hasImages(shownHtml) && !imagesLoaded;

          return (
            <React.Fragment key={msg.id}>
              {dateDivider}
              <div className={`message ${isSent ? 'sent' : 'received'}`}>
                {!isSent && <div className="sender-name">{msg.senderName}</div>}
                {showBanner && (
                  <ImageBanner
                    className="image-banner"
                    onShow={() => handleLoadImages(msg.id)}
                    onAlwaysShow={handleAlwaysLoadImages}
                  />
                )}
                <div className="message-bubble">
                  <MessageBody
                    html={shownHtml}
                    showImages={imagesLoaded}
                    variant={isSent ? 'sent' : 'received'}
                  />
                  {quoted && (
                    <button className="quote-toggle" onClick={() => toggleQuote(msg.id)}>
                      {quoteShown ? 'Hide quoted text' : 'Show quoted text'}
                    </button>
                  )}
                  {msg.bodyTruncated && (
                    <div className="body-truncated-note">
                      This message was too large to cache in full.
                    </div>
                  )}
                  <button
                    className="expand-message-btn"
                    onClick={() => setExpandedMessageId(msg.id)}
                  >
                    Open full message
                  </button>
                </div>
                <AttachmentList
                  attachments={msg.attachments}
                  messageId={msg.id}
                  onDownload={handleDownloadAttachment}
                />
                <div className="timestamp">{formatTime(msg.internalDate)}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {expandedMessage && (
        <div className="message-modal" onClick={() => setExpandedMessageId(null)}>
          <div className="message-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="message-modal-header">
              <div>
                <div className="message-modal-subject">
                  {expandedMessage.subject || subject}
                </div>
                <div className="message-modal-from">From: {expandedMessage.from}</div>
                <div className="message-modal-date">
                  {new Date(parseInt(expandedMessage.internalDate, 10)).toLocaleString()}
                </div>
              </div>
              <button
                className="message-modal-close"
                onClick={() => setExpandedMessageId(null)}
              >
                ✕
              </button>
            </div>
            {hasImages(expandedMessage.body) &&
              !alwaysLoadImages &&
              !loadedImages.has(expandedMessage.id) && (
                <ImageBanner
                  className="modal-image-banner"
                  onShow={() => handleLoadImages(expandedMessage.id)}
                  onAlwaysShow={handleAlwaysLoadImages}
                />
              )}
            <div className="message-modal-body">
              <MessageBody
                html={expandedMessage.body || expandedMessage.snippet || ''}
                showImages={alwaysLoadImages || loadedImages.has(expandedMessage.id)}
                variant="plain"
              />
            </div>
            <AttachmentList
              attachments={expandedMessage.attachments}
              messageId={expandedMessage.id}
              onDownload={handleDownloadAttachment}
            />
          </div>
        </div>
      )}

      {sendError && <div className="send-error">{sendError}</div>}

      <div className="input-container">
        <button
          className={`reply-all-toggle ${replyAll ? 'active' : ''}`}
          onClick={() => setReplyAll((v) => !v)}
          title={replyAll ? 'Replying to everyone' : 'Replying to sender only'}
        >
          {replyAll ? 'Reply all' : 'Reply'}
        </button>
        <textarea
          ref={textareaRef}
          className="message-input"
          placeholder="Reply..."
          rows="1"
          value={replyText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button
          className="send-button"
          disabled={!replyText.trim() || sending}
          onClick={handleSend}
        >
          {sending ? '...' : '↑'}
        </button>
      </div>
    </div>
  );
}
