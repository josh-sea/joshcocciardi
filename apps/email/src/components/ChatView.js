import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { downloadAttachment } from '../services/gmail';

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

function sanitizeHtml(html) {
  // Strip script tags and event handlers for safety
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

function hasImages(html) {
  // Check if HTML contains image tags
  return /<img\s+[^>]*src=/i.test(html);
}

function blockImages(html) {
  // Replace image src with a placeholder to prevent auto-loading
  return html.replace(
    /<img\s+([^>]*)src=["']([^"']*)["']([^>]*)>/gi,
    '<img $1src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23e5e5ea\' width=\'100\' height=\'100\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%238e8e93\' font-size=\'14\' font-family=\'sans-serif\'%3EImage%3C/text%3E%3C/svg%3E" data-original-src="$2" $3>'
  );
}

function AttachmentList({ attachments, messageId, onDownload }) {
  if (!attachments || attachments.length === 0) return null;
  
  const formatSize = (bytes) => {
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
          <button
            className="attachment-download"
            onClick={() => onDownload(messageId, att)}
          >
            Download
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ChatView({ thread, userEmail, accessToken, onBack, onSend }) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [expandedMessage, setExpandedMessage] = useState(null);
  const [loadedImages, setLoadedImages] = useState(new Set());
  const [alwaysLoadImages, setAlwaysLoadImages] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Sort messages chronologically (oldest first, newest at bottom)
  const messages = useMemo(() => 
    [...(thread?.messages || [])].sort((a, b) => {
      const aDate = parseInt(a.internalDate || 0, 10);
      const bDate = parseInt(b.internalDate || 0, 10);
      return aDate - bDate;
    }),
    [thread?.messages]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [thread?.messages, scrollToBottom]);

  useEffect(() => {
    // Reset loaded images when thread changes
    setLoadedImages(new Set());
  }, [thread?.id]);

  const handleLoadImages = useCallback((messageId) => {
    setLoadedImages(prev => new Set([...prev, messageId]));
  }, []);

  const handleAlwaysLoadImages = useCallback(() => {
    setAlwaysLoadImages(true);
    // Load all images in current thread
    const allMessageIds = messages.map(m => m.id);
    setLoadedImages(new Set(allMessageIds));
  }, [messages]);

  const handleDownloadAttachment = useCallback(async (messageId, attachment) => {
    try {
      const bytes = await downloadAttachment(accessToken, messageId, attachment.attachmentId);
      const blob = new Blob([bytes], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download attachment:', err);
      alert('Failed to download attachment. Please try again.');
    }
  }, [accessToken]);

  if (!thread) return null;
  
  const subject = thread.subject || '(no subject)';
  const participantCount = thread.participantCount || 1;

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;

    setSending(true);
    try {
      await onSend(replyText.trim());
      setReplyText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Failed to send:', err);
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
        <div style={{ width: 80 }} />
      </div>

      <div className="messages-container">
        {messages.map((msg) => {
          const isSent = msg.senderEmail === userEmail ||
            msg.senderEmail?.includes(userEmail);
          const messageClass = isSent ? 'sent' : 'received';
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

          const messageHtml = msg.body || msg.snippet || '';
          const hasImgs = hasImages(messageHtml);
          const imagesLoaded = alwaysLoadImages || loadedImages.has(msg.id);
          const processedHtml = sanitizeHtml(
            hasImgs && !imagesLoaded ? blockImages(messageHtml) : messageHtml
          );

          return (
            <React.Fragment key={msg.id}>
              {dateDivider}
              {hasImgs && !imagesLoaded && (
                <div className="image-banner">
                  <span>Images are hidden for your privacy</span>
                  <div className="image-banner-actions">
                    <button 
                      className="load-images-btn"
                      onClick={() => handleLoadImages(msg.id)}
                    >
                      Display images
                    </button>
                    <button 
                      className="always-load-btn"
                      onClick={handleAlwaysLoadImages}
                    >
                      Always display
                    </button>
                  </div>
                </div>
              )}
              <div className={`message ${messageClass}`}>
                {!isSent && (
                  <div className="sender-name">{msg.senderName}</div>
                )}
                <div
                  className="message-bubble"
                  onClick={() => setExpandedMessage(msg)}
                  dangerouslySetInnerHTML={{
                    __html: processedHtml,
                  }}
                />
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
        <div ref={messagesEndRef} />
      </div>

      {/* Modal for expanded message */}
      {expandedMessage && (
        <div className="message-modal" onClick={() => setExpandedMessage(null)}>
          <div className="message-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="message-modal-header">
              <div>
                <div className="message-modal-subject">{subject}</div>
                <div className="message-modal-from">From: {expandedMessage.senderName}</div>
                <div className="message-modal-date">
                  {new Date(parseInt(expandedMessage.internalDate, 10)).toLocaleString()}
                </div>
              </div>
              <button className="message-modal-close" onClick={() => setExpandedMessage(null)}>
                ✕
              </button>
            </div>
            {hasImages(expandedMessage.body || expandedMessage.snippet || '') && 
             !alwaysLoadImages && 
             !loadedImages.has(expandedMessage.id) && (
              <div className="modal-image-banner">
                <span>Images are hidden for your privacy</span>
                <div className="image-banner-actions">
                  <button 
                    className="load-images-btn"
                    onClick={() => handleLoadImages(expandedMessage.id)}
                  >
                    Display images
                  </button>
                  <button 
                    className="always-load-btn"
                    onClick={handleAlwaysLoadImages}
                  >
                    Always display
                  </button>
                </div>
              </div>
            )}
            <div
              className="message-modal-body"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(
                  hasImages(expandedMessage.body || expandedMessage.snippet || '') && 
                  !alwaysLoadImages && 
                  !loadedImages.has(expandedMessage.id)
                    ? blockImages(expandedMessage.body || expandedMessage.snippet || '')
                    : expandedMessage.body || expandedMessage.snippet || ''
                ),
              }}
            />
            <AttachmentList 
              attachments={expandedMessage.attachments}
              messageId={expandedMessage.id}
              onDownload={handleDownloadAttachment}
            />
          </div>
        </div>
      )}

      <div className="input-container">
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
          {sending ? '...' : '\u2191'}
        </button>
      </div>
    </div>
  );
}
